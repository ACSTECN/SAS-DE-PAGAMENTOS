import { Router, type Response } from 'express';
import multer from 'multer';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue } from '../lib/crypto.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseSpreadsheet, validateRows } from '../services/batches.js';
import { executePixPayment } from '../services/inter.js';
import type { BatchItemExecutionResult } from '../types/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

type ConnectionRow = {
  id: string;
  client_id: string;
  client_secret_encrypted: string;
  certificate_encrypted: string;
  private_key_encrypted: string;
  token_url: string;
  payment_url: string;
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

async function loadCompanyBatch(companyId: string, batchId: string) {
  const { data, error } = await supabaseAdmin
    .from('batches')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', batchId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Falha ao consultar lote.');
  }

  if (!data) {
    throw new ApiError(404, 'Lote não encontrado.');
  }

  return data;
}

async function loadCompanyConnection(companyId: string, connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', connectionId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Falha ao carregar conexão bancária.');
  }

  if (!data) {
    throw new ApiError(404, 'Conexão bancária não encontrada.');
  }

  return data;
}

async function updateBatchFinalStatus(batchId: string) {
  const { data: items, error } = await supabaseAdmin
    .from('batch_items')
    .select('status')
    .eq('batch_id', batchId);

  if (error) {
    throw new ApiError(500, 'Falha ao consolidar status do lote.');
  }

  const hasFailed = (items || []).some((item) => item.status === 'failed');

  await supabaseAdmin
    .from('batches')
    .update({
      status: hasFailed ? 'failed' : 'completed',
      processed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
}

async function executeBatchItem(
  connection: ConnectionRow,
  item: BatchItemRow,
): Promise<BatchItemExecutionResult> {
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
      paymentId: item.payment_id,
      recipientName: item.recipient_name,
      recipientDocument: item.recipient_document,
      pixKey: item.pix_key,
      amount: Number(item.amount),
      description: item.description || '',
    },
  );

  await supabaseAdmin.from('payment_attempts').insert({
    batch_item_id: item.id,
    idempotency_key: item.payment_id,
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

  return result;
}

router.post(
  '/',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;

    if (!file) {
      throw new ApiError(400, 'Envie um arquivo CSV ou XLSX.');
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('bank_connections')
      .select('*')
      .eq('company_id', req.currentUser!.companyId)
      .eq('bank_code', 'inter')
      .maybeSingle();

    if (connectionError || !connection) {
      throw new ApiError(400, 'Configure a conexão bancária antes de criar lotes.');
    }

    const rows = parseSpreadsheet(file.buffer, file.originalname);
    const { validRows, invalidRows, summary } = validateRows(rows);

    const { data: batch, error: batchError } = await supabaseAdmin
      .from('batches')
      .insert({
        company_id: req.currentUser!.companyId,
        created_by: req.currentUser!.id,
        bank_connection_id: connection.id,
        origin: 'upload',
        file_name: file.originalname,
        status: summary.totalValidItems ? 'validated' : 'draft',
        total_items: summary.totalItems,
        total_valid_items: summary.totalValidItems,
        total_invalid_items: summary.totalInvalidItems,
        total_amount: summary.totalAmount,
      })
      .select('id')
      .single();

    if (batchError || !batch) {
      throw new ApiError(400, batchError?.message || 'Falha ao criar lote.');
    }

    const itemsPayload = [
      ...validRows.map((row) => ({
        batch_id: batch.id,
        payment_id: row.payment_id,
        recipient_name: row.recipient_name,
        recipient_document: row.recipient_document,
        pix_key: row.pix_key,
        amount: row.amount,
        description: row.description,
        status: 'valid',
      })),
      ...invalidRows.map((row) => ({
        batch_id: batch.id,
        payment_id: String(row.payment_id || `invalid-${row.lineNumber}`),
        recipient_name: String(row.recipient_name || 'Linha inválida'),
        recipient_document: String(row.recipient_document || ''),
        pix_key: String(row.pix_key || ''),
        amount: Number(String(row.amount || 0).replace(',', '.')) || 0,
        description: String(row.description || ''),
        status: 'invalid',
        error_message: row.error,
      })),
    ];

    if (itemsPayload.length) {
      const { error: itemsError } = await supabaseAdmin.from('batch_items').insert(itemsPayload);

      if (itemsError) {
        throw new ApiError(400, itemsError.message || 'Falha ao registrar itens do lote.');
      }
    }

    res.status(201).json({
      success: true,
      batchId: batch.id,
      summary,
      invalidRows,
    });
  }),
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { data, error } = await supabaseAdmin
      .from('batches')
      .select('id, origin, file_name, status, total_items, total_valid_items, total_invalid_items, total_amount, created_at, processed_at')
      .eq('company_id', req.currentUser!.companyId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiError(500, 'Falha ao carregar histórico.');
    }

    res.json({
      success: true,
      batches: data || [],
    });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batch = await loadCompanyBatch(req.currentUser!.companyId, req.params.id);
    const { data: items, error } = await supabaseAdmin
      .from('batch_items')
      .select('*')
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiError(500, 'Falha ao carregar itens do lote.');
    }

    res.json({
      success: true,
      batch,
      items: items || [],
    });
  }),
);

router.post(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batch = await loadCompanyBatch(req.currentUser!.companyId, req.params.id);
    const connection = await loadCompanyConnection(req.currentUser!.companyId, batch.bank_connection_id);

    const { data: items, error } = await supabaseAdmin
      .from('batch_items')
      .select('*')
      .eq('batch_id', batch.id)
      .eq('status', 'valid');

    if (error) {
      throw new ApiError(500, 'Falha ao consultar itens válidos do lote.');
    }

    if (!items?.length) {
      throw new ApiError(400, 'Esse lote não possui itens válidos para execução.');
    }

    await supabaseAdmin
      .from('batches')
      .update({
        status: 'processing',
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', batch.id);

    const results = [];

    for (const item of items) {
      const result = await executeBatchItem(connection, item);
      results.push({
        itemId: item.id,
        paymentId: item.payment_id,
        result,
      });
    }

    await updateBatchFinalStatus(batch.id);

    res.json({
      success: true,
      results,
    });
  }),
);

router.post(
  '/:id/retry-item',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { itemId } = req.body ?? {};

    if (!itemId) {
      throw new ApiError(400, 'Informe o item a ser reprocessado.');
    }

    const batch = await loadCompanyBatch(req.currentUser!.companyId, req.params.id);
    const connection = await loadCompanyConnection(req.currentUser!.companyId, batch.bank_connection_id);

    const { data: item, error } = await supabaseAdmin
      .from('batch_items')
      .select('*')
      .eq('batch_id', batch.id)
      .eq('id', itemId)
      .maybeSingle();

    if (error || !item) {
      throw new ApiError(404, 'Item do lote não encontrado.');
    }

    const result = await executeBatchItem(connection, item);
    await updateBatchFinalStatus(batch.id);

    res.json({
      success: result.status === 'success',
      result,
    });
  }),
);

router.get(
  '/:id/export',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batch = await loadCompanyBatch(req.currentUser!.companyId, req.params.id);
    const { data: items, error } = await supabaseAdmin
      .from('batch_items')
      .select('payment_id, recipient_name, recipient_document, pix_key, amount, description, status, error_message, provider_end_to_end_id')
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiError(500, 'Falha ao exportar lote.');
    }

    const header = [
      'payment_id',
      'recipient_name',
      'recipient_document',
      'pix_key',
      'amount',
      'description',
      'status',
      'error_message',
      'provider_end_to_end_id',
    ];

    const rows = (items || []).map((item) =>
      header
        .map((column) => JSON.stringify(item[column as keyof typeof item] ?? ''))
        .join(','),
    );

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`lote-${batch.id}.csv`);
    res.send([header.join(','), ...rows].join('\n'));
  }),
);

export default router;
