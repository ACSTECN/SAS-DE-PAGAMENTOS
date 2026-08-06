import { Router, type Response } from 'express';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue } from '../lib/crypto.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { executePixPayment } from '../services/inter.js';

const router = Router();

async function loadValidatedConnection(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_code', 'inter')
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Falha ao consultar conexão bancária.');
  }

  if (!data) {
    throw new ApiError(400, 'A empresa ainda não configurou a conexão Banco Inter.');
  }

  return data;
}

router.post(
  '/single',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { paymentId, recipientName, recipientDocument, pixKey, amount, description } = req.body ?? {};

    if (!paymentId || !recipientName || !recipientDocument || !pixKey || !amount) {
      throw new ApiError(400, 'Informe os dados obrigatórios do pagamento.');
    }

    const connection = await loadValidatedConnection(req.currentUser!.companyId);

    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .insert({
        company_id: req.currentUser!.companyId,
        created_by: req.currentUser!.id,
        bank_connection_id: connection.id,
        origin: 'manual',
        file_name: `manual-${paymentId}`,
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
        payment_id: paymentId,
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
      throw new ApiError(400, itemError?.message || 'Falha ao registrar item do pagamento.');
    }

    const result = await executePixPayment(
      {
        clientId: connection.client_id,
        clientSecret: decryptSensitiveValue(connection.client_secret_encrypted),
        certificate: decryptSensitiveValue(connection.certificate_encrypted),
        privateKey: decryptSensitiveValue(connection.private_key_encrypted),
        tokenUrl: connection.token_url,
        paymentUrl: connection.payment_url,
      },
      {
        paymentId,
        recipientName,
        recipientDocument,
        pixKey,
        amount: Number(amount),
        description: description || '',
      },
    );

    await supabaseAdmin.from('payment_attempts').insert({
      batch_item_id: item.id,
      idempotency_key: paymentId,
      status: result.status,
      http_status: result.httpStatus || null,
      provider_message: result.providerMessage || null,
      provider_response: result.providerResponse || null,
    });

    await supabaseAdmin
      .from('batch_items')
      .update({
        status: result.status,
        error_message: result.status === 'failed' ? result.providerMessage || 'Falha' : null,
        provider_payment_id: result.providerPaymentId || null,
        provider_end_to_end_id: result.providerEndToEndId || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', item.id);

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
