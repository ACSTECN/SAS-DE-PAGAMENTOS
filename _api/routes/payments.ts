import { Router, type Response } from 'express';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, requireTenantUser, type AuthenticatedRequest } from '../lib/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  decryptConnection,
  executeUnifiedPixTransfer,
  type BankProvider,
} from '../services/bankProvider.js';
import type { BatchItemExecutionResult } from '../types/index.js';

const router = Router();

router.use(requireAuth);
router.use(requireTenantUser);

type AnyConnectionRow = {
  id: string;
  company_id: string;
  bank_code: string;
  environment: 'sandbox' | 'production';
  api_key_encrypted: string | null;
  client_id_encrypted: string | null;
  client_secret_encrypted: string | null;
  certificate_encrypted: string | null;
  private_key_encrypted: string | null;
};

type BatchItemRow = {
  id: string;
  payment_id: string;
  recipient_name: string;
  recipient_document: string;
  pix_key: string;
  amount: number;
  description: string | null;
};

function assertValidProvider(p: unknown): BankProvider {
  if (p === 'asaas' || p === 'inter') return p as BankProvider;
  throw new ApiError(400, 'Provedor bancário inválido nesta conexão. Reconfigure a conexão da empresa.');
}

async function loadActiveConnectionForCompany(companyId: string, connectionId?: string | null) {
  const query = supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .in('bank_code', ['asaas', 'inter'])
    .order('updated_at', { ascending: false })
    .limit(1);

  const { data, error } = connectionId
    ? await supabaseAdmin
        .from('bank_connections')
        .select('*')
        .eq('company_id', companyId)
        .eq('id', connectionId)
        .maybeSingle()
    : await query.maybeSingle();

  const row = Array.isArray(data) ? data[0] : data;
  if (error) throw new ApiError(500, 'Falha ao carregar conexão bancária da empresa.');
  if (!row) {
    throw new ApiError(
      400,
      'Conecte sua conta bancária (Asaas ou Banco Inter) antes de enviar pagamentos.',
    );
  }
  const typed = row as AnyConnectionRow;
  assertValidProvider(typed.bank_code);
  const decoded = decryptConnection(typed);
  if (!decoded) throw new ApiError(400, 'Não foi possível descriptografar as credenciais da conexão bancária. Reconfigure a conexão.');
  return { row: typed, decoded, provider: decoded.provider, credentials: decoded.credentials };
}

async function saveAttemptAndUpdate(
  itemId: string,
  itemPaymentId: string,
  result: BatchItemExecutionResult,
) {
  await supabaseAdmin.from('payment_attempts').insert({
    batch_item_id: itemId,
    idempotency_key: itemPaymentId,
    status: result.status,
    http_status: result.httpStatus || null,
    provider_message: result.providerMessage || null,
    provider_response: result.providerResponse || null,
  });

  await supabaseAdmin
    .from('batch_items')
    .update({
      status: result.status,
      error_message: result.status === 'failed' ? result.providerMessage || null : null,
      provider_payment_id: result.providerPaymentId || null,
      provider_end_to_end_id: result.providerEndToEndId || null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', itemId);
}

router.post(
  '/single',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId, recipientName, recipientDocument, pixKey, amount, description } =
      req.body ?? {};

    if (!paymentId || !recipientName || !recipientDocument || !pixKey || !amount) {
      throw new ApiError(400, 'Informe os dados obrigatórios do pagamento.');
    }

    const { row, provider, credentials } = await loadActiveConnectionForCompany(req.currentUser!.companyId);

    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .insert({
        company_id: req.currentUser!.companyId,
        created_by: req.currentUser!.id,
        bank_connection_id: row.id,
        origin: 'manual',
        file_name: `manual-${String(paymentId)}`,
        status: 'processing',
        total_items: 1,
        total_valid_items: 1,
        total_invalid_items: 0,
        total_amount: Number(amount),
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (batchError || !batch) {
      throw new ApiError(400, batchError?.message || 'Falha ao criar pagamento unitário.');
    }

    const { data: item, error: itemError } = await supabaseAdmin
      .from('batch_items')
      .insert({
        batch_id: batch.id,
        payment_id: String(paymentId),
        recipient_name: recipientName,
        recipient_document: recipientDocument,
        pix_key: pixKey,
        amount: Number(amount),
        description: description || '',
        status: 'valid',
      })
      .select('*')
      .single();

    if (itemError || !item) {
      throw new ApiError(400, itemError?.message || 'Falha ao registrar pagamento.');
    }

    const rowItem = item as unknown as BatchItemRow;

    const result = await executeUnifiedPixTransfer(provider, credentials, {
      idempotencyKey: rowItem.payment_id,
      pixKey: rowItem.pix_key,
      amountCents: Math.round(Number(rowItem.amount) * 100),
      description: rowItem.description || '',
      beneficiaryName: rowItem.recipient_name,
      beneficiaryDocument: rowItem.recipient_document,
    });

    // Normaliza para formato antigo compat (executeUnifiedPixTransfer retorna TransferResultItem, precisamos adaptar)
    const compat: BatchItemExecutionResult = {
      status: result.status,
      providerPaymentId: result.provider_payment_id ?? undefined,
      providerMessage: result.error_message ?? undefined,
      providerEndToEndId: (result as unknown as { end_to_end_id?: string }).end_to_end_id ?? undefined,
      httpStatus: undefined,
      providerResponse: null,
    };

    await saveAttemptAndUpdate(rowItem.id, rowItem.payment_id, compat);

    await supabaseAdmin
      .from('batches')
      .update({
        status: result.status === 'success' ? 'completed' : 'failed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    res.json({
      success: result.status === 'success',
      provider,
      batchId: batch.id,
      result,
    });
  }),
);

export default router;
