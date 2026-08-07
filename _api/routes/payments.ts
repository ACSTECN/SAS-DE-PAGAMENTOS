import { Router, type Response } from 'express';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, requireTenantUser, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue } from '../lib/crypto.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { executePixTransfer } from '../services/asaas.js';
import type { BatchItemExecutionResult } from '../types/index.js';

const router = Router();

router.use(requireAuth);
router.use(requireTenantUser);

type ConnectionRow = {
  id: string;
  bank_code: 'asaas';
  environment: 'sandbox' | 'production';
  api_key_encrypted?: string | null;
  client_secret_encrypted?: string | null;
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

function getDecryptedAsaasKey(conn: ConnectionRow): string {
  if (conn.api_key_encrypted) return decryptSensitiveValue(conn.api_key_encrypted);
  if (conn.client_secret_encrypted) return decryptSensitiveValue(conn.client_secret_encrypted);
  throw new ApiError(400, 'API Key da Asaas não encontrada na conexão da empresa.');
}

async function loadAsaasConnection(companyId: string, connectionId?: string) {
  const query = supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_code', 'asaas');

  const { data, error } = connectionId
    ? await query.eq('id', connectionId).maybeSingle()
    : await query.maybeSingle();

  if (error) throw new ApiError(500, 'Falha ao carregar conexão Asaas.');
  if (!data) {
    throw new ApiError(
      400,
      'A empresa ainda não configurou a sua conexão com a Asaas.',
    );
  }
  return data as unknown as ConnectionRow;
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

    const connection = await loadAsaasConnection(req.currentUser!.companyId);

    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .insert({
        company_id: req.currentUser!.companyId,
        created_by: req.currentUser!.id,
        bank_connection_id: connection.id,
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

    const row = item as unknown as BatchItemRow;
    const result = await executePixTransfer(
      {
        apiKey: getDecryptedAsaasKey(connection),
        environment: connection.environment,
      },
      {
        paymentId: row.payment_id,
        recipientName: row.recipient_name,
        recipientDocument: row.recipient_document,
        pixKey: row.pix_key,
        amount: Number(row.amount),
        description: row.description || '',
      },
    );

    await saveAttemptAndUpdate(row.id, row.payment_id, result);

    await supabaseAdmin
      .from('batches')
      .update({
        status: result.status === 'success' ? 'completed' : 'failed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    res.json({
      success: result.status === 'success',
      batchId: batch.id,
      result,
    });
  }),
);

export default router;
