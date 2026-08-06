import crypto from 'crypto';
import axios, { type AxiosRequestConfig } from 'axios';
import { env } from '../lib/env.js';
import { ApiError } from '../lib/api-error.js';
import type { BatchItemExecutionResult, PixKeyType } from '../types/index.js';

export type AsaasEnvironment = 'sandbox' | 'production';

export type AsaasConnectionCredentials = {
  apiKey: string;
  environment: AsaasEnvironment;
};

type AsaasTransferRequest = {
  value: number;
  pixAddressKey: string;
  pixAddressKeyType: PixKeyType;
  operationType: 'PIX';
  description?: string;
  scheduleDate?: string;
  externalReference?: string;
};

type AsaasCustomerResult = {
  object: 'list';
  hasMore: boolean;
  totalCount: number;
  limit: number;
  offset: number;
  data: unknown[];
};

type AsaasTransferResult = {
  object?: 'transfer';
  id?: string;
  type?: string;
  status?: string;
  value?: number;
  effectiveDate?: string;
  scheduleDate?: string;
  endToEndIdentifier?: string;
  externalReference?: string;
  description?: string;
  errors?: Array<{ code?: string; description?: string }>;
};

const ASAAS_SANDBOX_BASE = 'https://sandbox.asaas.com/api/v3';
const ASAAS_PRODUCTION_BASE = 'https://www.asaas.com/api/v3';

export function getAsaasBaseUrl(environment: AsaasEnvironment) {
  if (environment === 'production') return env.asaas.productionBaseUrl || ASAAS_PRODUCTION_BASE;
  return env.asaas.sandboxBaseUrl || ASAAS_SANDBOX_BASE;
}

function detectPixKeyType(key: string): PixKeyType {
  const trimmed = key.trim();
  if (trimmed.includes('@')) return 'EMAIL';

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 36) return 'EVP';
  if (digits.length === 11) {
    const mobileRegex = /^[1-9]{2}9\d{8}$/;
    return mobileRegex.test(digits) ? 'PHONE' : 'CPF';
  }
  if (digits.length === 14) return 'CNPJ';
  if (digits.length <= 15 && digits.length >= 10) return 'PHONE';

  return 'EVP';
}

function normalizePixKey(key: string, type: PixKeyType) {
  const trimmed = key.trim();
  switch (type) {
    case 'EMAIL':
      return trimmed.toLowerCase();
    case 'CPF':
    case 'CNPJ':
      return trimmed.replace(/\D/g, '');
    case 'PHONE': {
      const digits = trimmed.replace(/\D/g, '');
      if (!digits) return trimmed;
      return digits.startsWith('55') ? digits : `55${digits}`;
    }
    case 'EVP':
    default:
      return trimmed.toLowerCase();
  }
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildAsaasHeaders(apiKey: string, idempotencyKey?: string): AxiosRequestConfig['headers'] {
  return {
    access_token: apiKey,
    'Content-Type': 'application/json',
    'accept': 'application/json',
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };
}

function extractAsaasError(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Erro inesperado ao comunicar com Asaas.';
  }

  const body = error.response?.data as AsaasTransferResult | undefined;
  if (Array.isArray(body?.errors) && body.errors.length) {
    return body.errors
      .map((entry) => (entry.description ? `${entry.code || ''} ${entry.description}`.trim() : entry.code))
      .filter(Boolean)
      .join('; ') || error.message;
  }

  const generic = (error.response?.data as { message?: string } | undefined)?.message;
  return generic || error.message || 'Falha na comunicação com a API do Asaas.';
}

export async function validateAsaasConnection(credentials: AsaasConnectionCredentials) {
  if (env.mockBankMode) {
    return { valid: true, customerCount: 0, environment: credentials.environment };
  }

  const baseUrl = getAsaasBaseUrl(credentials.environment);

  try {
    const response = await axios.get<AsaasCustomerResult>(`${baseUrl}/customers`, {
      headers: buildAsaasHeaders(credentials.apiKey),
      params: { limit: 1, offset: 0 },
      timeout: 15000,
    });

    return {
      valid: true,
      customerCount: Number(response.data?.totalCount || 0),
      environment: credentials.environment,
    };
  } catch (error) {
    const message = extractAsaasError(error);
    throw new ApiError(502, `Falha ao validar conexão com Asaas: ${message}`);
  }
}

export async function executePixTransfer(
  credentials: AsaasConnectionCredentials,
  payload: {
    paymentId: string;
    recipientName: string;
    recipientDocument: string;
    pixKey: string;
    amount: number;
    description: string;
  },
): Promise<BatchItemExecutionResult> {
  if (env.mockBankMode) {
    const success = payload.amount > 0 && Number(payload.amount.toFixed(2)) <= 999999;
    return {
      status: success ? 'success' : 'failed',
      providerMessage: success
        ? 'Pagamento Asaas (mock) processado com sucesso.'
        : 'Pagamento Asaas (mock) recusado por limite de validação.',
      providerPaymentId: `asaas_mock_${payload.paymentId}`,
      providerEndToEndId: crypto.randomUUID(),
      httpStatus: success ? 200 : 422,
      providerResponse: { mock: true, bank: 'asaas', provider: 'asaas' },
    };
  }

  const pixKeyType = detectPixKeyType(payload.pixKey);
  const normalizedPixKey = normalizePixKey(payload.pixKey, pixKeyType);
  const amount = Number(Number(payload.amount).toFixed(2));
  const description = (payload.description || 'Pagamento PIX via SaaS Asaas').slice(0, 490);

  const requestBody: AsaasTransferRequest = {
    value: amount,
    pixAddressKey: normalizedPixKey,
    pixAddressKeyType: pixKeyType,
    operationType: 'PIX',
    description,
    scheduleDate: formatDateOnly(new Date()),
    externalReference: payload.paymentId,
  };

  try {
    const response = await axios.post<AsaasTransferResult>(
      `${getAsaasBaseUrl(credentials.environment)}/transfers`,
      requestBody,
      {
        headers: buildAsaasHeaders(credentials.apiKey, payload.paymentId),
        timeout: 60_000,
      },
    );

    const result = response.data || {};
    const statusText = typeof result.status === 'string' ? result.status : 'CONFIRMED';
    const isSuccess =
      response.status >= 200 &&
      response.status < 300 &&
      !Array.isArray(result.errors) &&
      statusText.toUpperCase() !== 'REJECTED' &&
      statusText.toUpperCase() !== 'CANCELLED';

    return {
      status: isSuccess ? 'success' : 'failed',
      providerMessage:
        result.status || (isSuccess ? 'Transferência Asaas criada com sucesso.' : 'Transferência recusada pelo Asaas.'),
      providerPaymentId: result.id || undefined,
      providerEndToEndId: result.endToEndIdentifier || undefined,
      httpStatus: response.status,
      providerResponse: result,
    };
  } catch (error) {
    const message = extractAsaasError(error);
    const httpStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
    const providerResponse = axios.isAxiosError(error) ? error.response?.data : undefined;

    return {
      status: 'failed',
      providerMessage: message,
      httpStatus,
      providerResponse,
    };
  }
}

export async function executeBatchTransferQueue(
  credentials: AsaasConnectionCredentials,
  items: Array<{
    id: string;
    paymentId: string;
    recipientName: string;
    recipientDocument: string;
    pixKey: string;
    amount: number;
    description: string;
  }>,
  options?: {
    concurrency?: number;
    delayMs?: number;
    onProgress?: (completed: number, total: number, result: BatchItemExecutionResult & { itemId: string; paymentId: string }) => void;
  },
): Promise<Array<{ itemId: string; paymentId: string; result: BatchItemExecutionResult }>> {
  const concurrency = options?.concurrency || 1;
  const delayMs = options?.delayMs ?? 150;
  const onProgress = options?.onProgress;
  const results: Array<{
    itemId: string;
    paymentId: string;
    result: BatchItemExecutionResult;
  }> = [];

  let cursor = 0;
  const total = items.length;

  async function processNext() {
    while (cursor < total) {
      const currentIndex = cursor;
      cursor += 1;
      const item = items[currentIndex];

      try {
        const partial = await executePixTransfer(credentials, {
          paymentId: item.paymentId,
          recipientName: item.recipientName,
          recipientDocument: item.recipientDocument,
          pixKey: item.pixKey,
          amount: item.amount,
          description: item.description,
        });

        const entry = {
          itemId: item.id,
          paymentId: item.paymentId,
          result: partial,
        };
        results.push(entry);
        onProgress?.(results.length, total, { ...partial, itemId: item.id, paymentId: item.paymentId });

        if (delayMs > 0 && currentIndex !== total - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (unexpected) {
        const fallback: BatchItemExecutionResult = {
          status: 'failed',
          providerMessage:
            unexpected instanceof Error ? unexpected.message : 'Falha inesperada durante o envio.',
          httpStatus: 500,
        };
        const entry = {
          itemId: item.id,
          paymentId: item.paymentId,
          result: fallback,
        };
        results.push(entry);
        onProgress?.(results.length, total, { ...fallback, itemId: item.id, paymentId: item.paymentId });

        if (delayMs > 0 && currentIndex !== total - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, total) },
    () => processNext(),
  );

  await Promise.all(workers);
  return results;
}
