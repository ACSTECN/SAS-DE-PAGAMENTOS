import https from 'https';
import crypto from 'crypto';
import axios from 'axios';
import { env } from '../lib/env.js';
import { ApiError } from '../lib/api-error.js';
import type { BatchItemExecutionResult } from '../types/index.js';

export type InterConnectionCredentials = {
  clientId: string;
  clientSecret: string;
  certificate: string;
  privateKey: string;
  tokenUrl: string;
  paymentUrl: string;
};

function buildHttpsAgent(credentials: InterConnectionCredentials) {
  return new https.Agent({
    cert: credentials.certificate,
    key: credentials.privateKey,
    rejectUnauthorized: true,
  });
}

function normalizePhoneKey(key: string) {
  const digits = key.replace(/\D/g, '');
  if (!digits) return key;
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function guessPixKeyType(key: string) {
  const trimmed = key.trim();
  if (trimmed.includes('@') && trimmed.includes('.')) return 'email';

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11) return 'cpf';
  if (digits.length === 14) return 'cnpj';
  if (digits.length >= 10 && digits.length <= 15) return 'telefone';

  return 'aleatoria';
}

export async function requestInterToken(credentials: InterConnectionCredentials) {
  if (env.mockBankMode) {
    return 'mock-inter-access-token';
  }

  try {
    const httpsAgent = buildHttpsAgent(credentials);
    const params = new URLSearchParams({ grant_type: 'client_credentials' });

    const response = await axios.post(credentials.tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: credentials.clientId,
        password: credentials.clientSecret,
      },
      httpsAgent,
      timeout: 20000,
    });

    const accessToken = response.data?.access_token;

    if (!accessToken) {
      throw new ApiError(502, 'O Banco Inter não retornou access_token.');
    }

    return accessToken as string;
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data?.error_description ||
        error.response?.data?.message ||
        error.message
      : 'Falha ao autenticar no Banco Inter.';

    throw new ApiError(502, `Falha ao autenticar no Banco Inter: ${message}`);
  }
}

export async function executePixPayment(
  credentials: InterConnectionCredentials,
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
    return {
      status: payload.amount <= 9999 ? 'success' : 'failed',
      providerMessage:
        payload.amount <= 9999
          ? 'Pagamento mock do Banco Inter processado com sucesso.'
          : 'Pagamento mock recusado por limite de validação.',
      providerPaymentId: payload.paymentId,
      providerEndToEndId: crypto.randomUUID(),
      httpStatus: payload.amount <= 9999 ? 200 : 422,
      providerResponse: { mock: true, bank: 'inter' },
    };
  }

  const accessToken = await requestInterToken(credentials);
  const httpsAgent = buildHttpsAgent(credentials);
  const pixKeyType = guessPixKeyType(payload.pixKey);
  const normalizedPixKey =
    pixKeyType === 'telefone' ? normalizePhoneKey(payload.pixKey) : payload.pixKey.trim();

  const requestBody = {
    valor: payload.amount.toFixed(2),
    chave: normalizedPixKey,
    descricao: payload.description.slice(0, 140),
    id: payload.paymentId,
  };

  try {
    const response = await axios.post(credentials.paymentUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.paymentId,
      },
      httpsAgent,
      timeout: 30000,
    });

    return {
      status: 'success',
      providerPaymentId: response.data?.id || payload.paymentId,
      providerEndToEndId: response.data?.endToEndId || response.data?.e2eId || undefined,
      providerMessage: response.data?.message || 'Pagamento enviado com sucesso ao Banco Inter.',
      httpStatus: response.status,
      providerResponse: response.data,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return {
        status: 'failed',
        providerMessage:
          error.response?.data?.message ||
          error.response?.data?.error ||
          error.message,
        httpStatus: error.response?.status,
        providerResponse: error.response?.data,
      };
    }

    return {
      status: 'failed',
      providerMessage: 'Falha inesperada ao processar o pagamento no Banco Inter.',
    };
  }
}
