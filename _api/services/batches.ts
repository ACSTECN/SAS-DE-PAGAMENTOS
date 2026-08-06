import XLSX from 'xlsx';
import { ApiError } from '../lib/api-error.js';
import type { BatchUploadRow, BatchValidationSummary } from '../types/index.js';

const requiredHeaders = [
  'payment_id',
  'recipient_name',
  'recipient_document',
  'pix_key',
  'amount',
  'description',
] as const;

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '');
}

function normalizePixKey(value: string) {
  return String(value || '').trim();
}

function normalizeAmount(value: unknown) {
  const normalized = Number(String(value).replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : NaN;
}

function isPixKeyValid(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return false;

  const emailPattern = /\S+@\S+\.\S+/;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const digits = trimmed.replace(/\D/g, '');

  return (
    emailPattern.test(trimmed) ||
    uuidPattern.test(trimmed) ||
    digits.length === 11 ||
    digits.length === 14 ||
    digits.length >= 10
  );
}

export function parseSpreadsheet(buffer: Buffer, fileName: string) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new ApiError(400, 'A planilha está vazia.');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: '',
  });

  if (!rows.length) {
    throw new ApiError(400, `O arquivo ${fileName} não possui linhas de dados.`);
  }

  return rows.map((row) => {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = value;
    }

    return normalized;
  });
}

export function validateRows(rawRows: Record<string, unknown>[]) {
  const firstRow = rawRows[0] || {};
  const missingHeaders = requiredHeaders.filter((header) => !(header in firstRow));

  if (missingHeaders.length) {
    throw new ApiError(
      400,
      `A planilha precisa conter as colunas: ${missingHeaders.join(', ')}.`,
    );
  }

  const validRows: BatchUploadRow[] = [];
  const invalidRows: Array<Record<string, unknown> & { error: string; lineNumber: number }> = [];
  const paymentIds = new Set<string>();

  rawRows.forEach((row, index) => {
    const paymentId = String(row.payment_id || '').trim();
    const recipientName = String(row.recipient_name || '').trim();
    const recipientDocument = String(row.recipient_document || '').trim();
    const pixKey = normalizePixKey(String(row.pix_key || ''));
    const amount = normalizeAmount(row.amount);
    const description = String(row.description || '').trim();

    const errors: string[] = [];

    if (!paymentId) errors.push('payment_id obrigatório');
    if (!recipientName) errors.push('recipient_name obrigatório');
    if (!recipientDocument) errors.push('recipient_document obrigatório');
    if (!pixKey || !isPixKeyValid(pixKey)) errors.push('pix_key inválida');
    if (!Number.isFinite(amount) || amount <= 0) errors.push('amount inválido');
    if (paymentIds.has(paymentId)) errors.push('payment_id duplicado no lote');

    if (errors.length) {
      invalidRows.push({
        ...row,
        lineNumber: index + 2,
        error: errors.join(' | '),
      });
      return;
    }

    paymentIds.add(paymentId);
    validRows.push({
      payment_id: paymentId,
      recipient_name: recipientName,
      recipient_document: recipientDocument,
      pix_key: pixKey,
      amount,
      description,
    });
  });

  const summary: BatchValidationSummary = {
    totalItems: rawRows.length,
    totalValidItems: validRows.length,
    totalInvalidItems: invalidRows.length,
    totalAmount: validRows.reduce((sum, row) => sum + row.amount, 0),
  };

  return {
    validRows,
    invalidRows,
    summary,
  };
}
