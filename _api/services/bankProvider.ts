import {
  validateAsaasConnection,
  executePixTransfer as executeAsaasPixTransfer,
  executeBatchTransferQueue as executeAsaasQueue,
  getAsaasBaseUrl,
  type AsaasConnectionCredentials,
  type AsaasEnvironment,
} from './asaas.js';
import {
  validateInterConnection,
  executeInterPixTransfer,
  executeInterBatchTransferQueue,
  resolveInterUrls,
  type InterConnectionCredentials,
  type InterEnvironment,
} from './inter.js';
import {
  validateC6Connection,
  executeC6PixTransfer,
  executeC6BatchTransferQueue,
  resolveC6Urls,
  type C6ConnectionCredentials,
  type C6Environment,
} from './c6.js';
import { decryptSensitiveValue, encryptSensitiveValue } from '../lib/crypto.js';

export type TransferResultItem = {
  idempotencyKey: string;
  success: boolean;
  amountCents: number;
  pixKey: string;
  providerPaymentId?: string;
  endToEndId?: string;
  errorMessage?: string;
  raw?: unknown;
};

export type BankProvider = 'c6' | 'asaas' | 'inter';

export interface UnifiedTestResult {
  valid: boolean;
  message: string;
}

export interface BaseExecuteSingleArgs {
  idempotencyKey: string;
  pixKey: string;
  amountCents: number;
  description?: string;
  beneficiaryName?: string;
  beneficiaryDocument?: string;
}

export interface UnifiedConnectionPayload {
  bank_code: BankProvider;
  environment: 'sandbox' | 'production';
  api_key_plain?: string | null;
  client_id_plain?: string | null;
  client_secret_plain?: string | null;
  certificate_pem_plain?: string | null;
  private_key_pem_plain?: string | null;
}

export function encryptConnectionForInsert(payload: UnifiedConnectionPayload) {
  const base = {
    bank_code: payload.bank_code,
    environment: payload.environment,
    status: 'pending' as const,
  };

  if (payload.bank_code === 'asaas') {
    return {
      ...base,
      api_key_encrypted: encryptSensitiveValue(payload.api_key_plain || ''),
      client_id_encrypted: encryptSensitiveValue('na'),
      client_secret_encrypted: encryptSensitiveValue('na'),
      certificate_encrypted: encryptSensitiveValue('na'),
      private_key_encrypted: encryptSensitiveValue('na'),
    };
  }

  return {
    ...base,
    api_key_encrypted: encryptSensitiveValue('na'),
    client_id_encrypted: encryptSensitiveValue(payload.client_id_plain || ''),
    client_secret_encrypted: encryptSensitiveValue(payload.client_secret_plain || ''),
    certificate_encrypted: encryptSensitiveValue(payload.certificate_pem_plain || ''),
    private_key_encrypted: encryptSensitiveValue(payload.private_key_pem_plain || ''),
  };
}

export function decryptConnection(conn: {
  bank_code: string;
  api_key_encrypted: string | null;
  client_id_encrypted: string | null;
  client_secret_encrypted: string | null;
  certificate_encrypted: string | null;
  private_key_encrypted: string | null;
  environment: string | null;
}):
  | { provider: 'c6'; credentials: C6ConnectionCredentials; environment: C6Environment }
  | { provider: 'asaas'; credentials: AsaasConnectionCredentials; environment: AsaasEnvironment }
  | { provider: 'inter'; credentials: InterConnectionCredentials; environment: InterEnvironment }
  | null {
  const provider = (conn.bank_code || '').toLowerCase() as BankProvider;
  const env = (conn.environment || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';

  if (provider === 'asaas') {
    const apiKey = decryptSensitiveValue(conn.api_key_encrypted || '');
    if (!apiKey || apiKey === 'na') return null;
    return {
      provider: 'asaas',
      environment: env as AsaasEnvironment,
      credentials: {
        apiKey,
        environment: env as AsaasEnvironment,
        baseUrl: getAsaasBaseUrl(env as AsaasEnvironment),
      },
    };
  }

  if (provider === 'inter') {
    const clientId = decryptSensitiveValue(conn.client_id_encrypted || '');
    const clientSecret = decryptSensitiveValue(conn.client_secret_encrypted || '');
    const cert = decryptSensitiveValue(conn.certificate_encrypted || '');
    const priv = decryptSensitiveValue(conn.private_key_encrypted || '');
    if (!clientId || clientId === 'na' || !clientSecret || clientSecret === 'na') return null;
    if (!cert || cert === 'na' || !priv || priv === 'na') return null;
    return {
      provider: 'inter',
      environment: env as InterEnvironment,
      credentials: {
        clientId,
        clientSecret,
        certificatePem: cert,
        privateKeyPem: priv,
        environment: env as InterEnvironment,
      },
    };
  }

  if (provider === 'c6') {
    const clientId = decryptSensitiveValue(conn.client_id_encrypted || '');
    const clientSecret = decryptSensitiveValue(conn.client_secret_encrypted || '');
    const cert = decryptSensitiveValue(conn.certificate_encrypted || '');
    const priv = decryptSensitiveValue(conn.private_key_encrypted || '');
    if (!clientId || clientId === 'na' || !clientSecret || clientSecret === 'na') return null;
    if (!cert || cert === 'na' || !priv || priv === 'na') return null;
    return {
      provider: 'c6',
      environment: env as C6Environment,
      credentials: {
        clientId,
        clientSecret,
        certificatePem: cert,
        privateKeyPem: priv,
        environment: env as C6Environment,
      },
    };
  }

  return null;
}

export async function validateConnectionUnified(
  provider: BankProvider,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creds: any,
  env: 'sandbox' | 'production',
): Promise<UnifiedTestResult> {
  if (provider === 'c6') return validateC6Connection(creds as C6ConnectionCredentials);
  if (provider === 'asaas') return validateAsaasConnection(creds as AsaasConnectionCredentials, env as AsaasEnvironment);
  return validateInterConnection(creds as InterConnectionCredentials);
}

export async function executeUnifiedPixTransfer(
  provider: BankProvider,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creds: any,
  args: BaseExecuteSingleArgs,
): Promise<TransferResultItem> {
  if (provider === 'c6') return executeC6PixTransfer(creds as C6ConnectionCredentials, args);
  if (provider === 'asaas') return executeAsaasPixTransfer(creds as AsaasConnectionCredentials, args);
  return executeInterPixTransfer(creds as InterConnectionCredentials, args);
}

export async function executeUnifiedBatchQueue(
  provider: BankProvider,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creds: any,
  items: BaseExecuteSingleArgs[],
  opts?: { concurrency?: number; delayMs?: number; onProgress?: (done: number, total: number, result: TransferResultItem) => void },
): Promise<TransferResultItem[]> {
  if (provider === 'c6') return executeC6BatchTransferQueue(creds as C6ConnectionCredentials, items, opts);
  if (provider === 'asaas') return executeAsaasQueue(creds as AsaasConnectionCredentials, items, opts);
  return executeInterBatchTransferQueue(creds as InterConnectionCredentials, items, opts);
}

export function getProviderDisplay(provider: BankProvider | string | null | undefined) {
  if (provider === 'c6') return 'C6 Bank';
  if (provider === 'asaas') return 'Asaas Conta Digital';
  if (provider === 'inter') return 'Banco Inter Empresas';
  return 'Provedor bancário';
}

export function getProviderBaseUrlsForUi(provider: BankProvider | string, env: 'sandbox' | 'production') {
  if (provider === 'c6') return resolveC6Urls(env as C6Environment);
  if (provider === 'asaas') return { base: getAsaasBaseUrl(env as AsaasEnvironment) };
  if (provider === 'inter') return resolveInterUrls(env as InterEnvironment);
  return { base: '' };
}
