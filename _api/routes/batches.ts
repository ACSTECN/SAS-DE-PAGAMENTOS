import { Router, type Response } from 'express';
import multer from 'multer';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue } from '../lib/crypto.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { parseSpreadsheet, validateRows } from '../services/batches.js';
import { executeBatchTransferQueue } from '../services/asaas.js';
import type { BatchItemExecutionResult } from '../types/index.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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
  throw new ApiError(400, 'API Key da Asaas não encontrada na conexão.');
}

async function loadCompanyBatch(companyId: string, batchId: string) {
  const { data, error } = await supabaseAdmin
    .from('batches')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', batchId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Falha ao consultar lote.');
  if (!data) throw new ApiError(404, 'Lote não encontrado.');
  return data as {
    id: string;
    company_id: string;
    bank_connection_id: string;
    status: string;
  };
}

async function loadAsaasConnection(companyId: string, connectionId: string) {
  const { data, error } = await supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('id', connectionId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Falha ao carregar conexão Asaas.');
  if (!data) throw new ApiError(404, 'Conexão Asaas não encontrada para esta empresa.');
  return data as unknown as ConnectionRow;
}

async function ensureActiveAsaasForCompany(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_code', 'asaas')
    .maybeSingle();

  if (error) throw new ApiError(500, 'Falha ao verificar conexão Asaas.');
  if (!data) {
    throw new ApiError(
      400,
      'Conecte sua conta Asaas antes de importar planilhas de pagamentos.',
    );
  }
  return data as unknown as ConnectionRow;
}

async function updateBatchFinalStatus(batchId: string) {
  const { data: items, error } = await supabaseAdmin
    .from('batch_items')
    .select('status')
    .eq('batch_id', batchId);

  if (error) throw new ApiError(500, 'Falha ao consolidar status do lote.');
  const all = items || [];
  const success = all.filter((i) => i.status === 'success').length;
  const failed = all.filter((i) => i.status === 'failed').length;

  let finalStatus: 'completed' | 'failed' | 'partial' = 'completed';
  if (failed > 0 && success === 0) finalStatus = 'failed';
  else if (failed > 0 && success > 0) finalStatus = 'partial';

  await supabaseAdmin
    .from('batches')
    .update({
      status: finalStatus,
      processed_at: new Date().toISOString(),
    })
    .eq('id', batchId);
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
  '/',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file;
    if (!file) throw new ApiError(400, 'Envie um arquivo CSV ou XLSX.');

    const connection = await ensureActiveAsaasForCompany(req.currentUser!.companyId);
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
        status: 'valid' as const,
      })),
      ...invalidRows.map((row) => ({
        batch_id: batch.id,
        payment_id: String(row.payment_id || `invalid-${row.lineNumber}`),
        recipient_name: String(row.recipient_name || 'Linha inválida'),
        recipient_document: String(row.recipient_document || ''),
        pix_key: String(row.pix_key || ''),
        amount: Number(String(row.amount || 0).replace(',', '.')) || 0,
        description: String(row.description || ''),
        status: 'invalid' as const,
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
      .select(
        'id, origin, file_name, status, total_items, total_valid_items, total_invalid_items, total_amount, created_at, confirmed_at, processed_at',
      )
      .eq('company_id', req.currentUser!.companyId)
      .order('created_at', { ascending: false });

    if (error) throw new ApiError(500, 'Falha ao carregar histórico de lotes.');

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

    if (error) throw new ApiError(500, 'Falha ao carregar itens do lote.');

    const { count: successCount, error: successCountError } = await supabaseAdmin
      .from('batch_items')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .eq('status', 'success');

    const { count: failedCount, error: failedCountError } = await supabaseAdmin
      .from('batch_items')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .eq('status', 'failed');

    const { count: pendingCount, error: pendingCountError } = await supabaseAdmin
      .from('batch_items')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id)
      .not('status', 'in', '("success","failed","invalid")');

    if (successCountError || failedCountError || pendingCountError) {
      throw new ApiError(500, 'Falha ao calcular progresso do lote.');
    }

    res.json({
      success: true,
      batch,
      items: items || [],
      progress: {
        total: items?.length || 0,
        success: Number(successCount || 0),
        failed: Number(failedCount || 0),
        pending: Number(pendingCount || 0),
      },
    });
  }),
);

router.post(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const batch = await loadCompanyBatch(req.currentUser!.companyId, req.params.id);
    const connection = await loadAsaasConnection(
      req.currentUser!.companyId,
      batch.bank_connection_id,
    );

    const { data: items, error } = await supabaseAdmin
      .from('batch_items')
      .select('*')
      .eq('batch_id', batch.id)
      .eq('status', 'valid');

    if (error) throw new ApiError(500, 'Falha ao consultar itens válidos do lote.');
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

    const normalizedItems = (items as unknown as BatchItemRow[]).map((row) => ({
      id: row.id,
      paymentId: row.payment_id,
      recipientName: row.recipient_name,
      recipientDocument: row.recipient_document,
      pixKey: row.pix_key,
      amount: Number(row.amount),
      description: row.description || '',
    }));

    const processed = await executeBatchTransferQueue(
      {
        apiKey: getDecryptedAsaasKey(connection),
        environment: connection.environment,
      },
      normalizedItems,
      {
        concurrency: 1,
        delayMs: 120,
      },
    );

    for (const entry of processed) {
      await saveAttemptAndUpdate(entry.itemId, entry.paymentId, entry.result);
    }

    await updateBatchFinalStatus(batch.id);

    res.json({
      success: true,
      results: processed.map((entry) => ({
        itemId: entry.itemId,
        paymentId: entry.paymentId,
        result: entry.result,
      })),
    });
  }),
);

router.post(
  '/:id/retry-item',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { itemId } = req.body ?? {};
    if (!itemId) throw new ApiError(400, 'Informe o item a ser reprocessado.');

    const batch = await loadCompanyBatch(req.currentUser!.companyId, req.params.id);
    const connection = await loadAsaasConnection(
      req.currentUser!.companyId,
      batch.bank_connection_id,
    );

    const { data: item, error } = await supabaseAdmin
      .from('batch_items')
      .select('*')
      .eq('batch_id', batch.id)
      .eq('id', itemId)
      .maybeSingle();

    if (error || !item) throw new ApiError(404, 'Item do lote não encontrado.');

    const row = item as unknown as BatchItemRow;
    const result = await executeBatchTransferQueue(
      {
        apiKey: getDecryptedAsaasKey(connection),
        environment: connection.environment,
      },
      [
        {
          id: row.id,
          paymentId: row.payment_id,
          recipientName: row.recipient_name,
          recipientDocument: row.recipient_document,
          pixKey: row.pix_key,
          amount: Number(row.amount),
          description: row.description || '',
        },
      ],
      { concurrency: 1, delayMs: 0 },
    );

    const first = result[0];
    if (first) {
      await saveAttemptAndUpdate(first.itemId, first.paymentId, first.result);
    }
    await updateBatchFinalStatus(batch.id);

    res.json({
      success: first?.result.status === 'success',
      result: first?.result,
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
      .select(
        'payment_id, recipient_name, recipient_document, pix_key, amount, description, status, error_message, provider_payment_id, provider_end_to_end_id, processed_at',
      )
      .eq('batch_id', batch.id)
      .order('created_at', { ascending: true });

    if (error) throw new ApiError(500, 'Falha ao exportar lote.');

    const header = [
      'payment_id',
      'recipient_name',
      'recipient_document',
      'pix_key',
      'amount',
      'description',
      'status',
      'error_message',
      'provider_payment_id',
      'provider_end_to_end_id',
      'processed_at',
    ];

    const rows = (items || []).map((item) =>
      header
        .map((column) => JSON.stringify((item as Record<string, unknown>)[column] ?? ''))
        .join(','),
    );

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`lote-asaas-${batch.id}.csv`);
    res.send([header.join(','), ...rows].join('\n'));
  }),
);

export default router;
