import { env } from '../lib/env.js';
import type { TransferResultItem, BaseExecuteSingleArgs } from './bankProvider.js';

export type C6Environment = 'sandbox' | 'production';

type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

const C6_PIX_KEY_TYPE_MAP: Record<PixKeyType, 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'CHAVE_ALEATORIA'> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'EMAIL',
  PHONE: 'TELEFONE',
  EVP: 'CHAVE_ALEATORIA',
};

export interface C6ConnectionCredentials {
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: C6Environment;
}

export interface C6TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export function detectC6PixKeyType(raw: string): PixKeyType {
  const key = String(raw || '').trim();
  const digits = key.replace(/\D/g, '');
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(key)) return 'EVP';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return 'EMAIL';
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  if (digits.length >= 10 && digits.length <= 15) return 'PHONE';
  return 'EVP';
}

export function normalizeC6PixKey(raw: string, type: PixKeyType): string {
  const key = String(raw || '').trim();
  const digits = key.replace(/\D/g, '');
  switch (type) {
    case 'CPF':
      return digits.padStart(11, '0').slice(0, 11);
    case 'CNPJ':
      return digits.padStart(14, '0').slice(0, 14);
    case 'PHONE':
      return digits;
    case 'EMAIL':
      return key.toLowerCase();
    case 'EVP':
    default:
      return key.toLowerCase();
  }
}

export function resolveC6Urls(environment: C6Environment) {
  const cfg = env.c6;
  if (environment === 'production') {
    return {
      tokenUrl: cfg.productionTokenUrl,
      pixUrl: cfg.productionPixUrl,
    };
  }
  return {
    tokenUrl: cfg.sandboxTokenUrl,
    pixUrl: cfg.sandboxPixUrl,
  };
}

async function buildC6Agent(certificatePem: string, privateKeyPem: string) {
  const https = await import('node:https');
  const crypto = await import('node:crypto');

  const cert = String(certificatePem || '')
    .replace(/\r\n/g, '\n')
    .replace(/ +/g, ' ')
    .trim();
  const key = String(privateKeyPem || '')
    .replace(/\r\n/g, '\n')
    .replace(/ +/g, ' ')
    .trim();

  return new https.Agent({
    cert,
    key,
    secureContext: crypto.createSecureContext({ cert, key }),
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  });
}

export async function getC6AccessToken(creds: C6ConnectionCredentials): Promise<string> {
  const { tokenUrl } = resolveC6Urls(creds.environment);
  const agent = await buildC6Agent(creds.certificatePem, creds.privateKeyPem);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'pix.write pix.read webhook.write webhook.read',
  });

  const authHeader = `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal = globalThis as any;
  const resp = await anyGlobal.fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    agent,
  });

  const text = await resp.text();
  let json: C6TokenResponse & { error?: string; error_description?: string } = {} as C6TokenResponse;
  try { json = JSON.parse(text); } catch { /* ignora */ }

  if (!resp.ok || !json.access_token) {
    const msg = json.error_description || json.error || text || `Falha ao obter token C6 (HTTP ${resp.status})`;
    throw new Error(`[C6 Bank] ${msg}`);
  }
  return json.access_token;
}

export async function validateC6Connection(creds: C6ConnectionCredentials): Promise<{ valid: boolean; message: string }> {
  try {
    await getC6AccessToken(creds);
    return { valid: true, message: 'Conexão C6 Bank validada com sucesso (OAuth2 + mTLS ok).' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, message: msg };
  }
}

/**
 * Executa 1 transferencia Pix via API do C6 Bank.
 * Endpoint padrão: POST {pixUrl}/pix/v2/pagamento
 */
export async function executeC6PixTransfer(
  creds: C6ConnectionCredentials,
  args: BaseExecuteSingleArgs,
): Promise<TransferResultItem> {
  const accessToken = await getC6AccessToken(creds);
  const { pixUrl } = resolveC6Urls(creds.environment);
  const agent = await buildC6Agent(creds.certificatePem, creds.privateKeyPem);

  const pixKey = args.pixKey.trim();
  const detectedType = detectC6PixKeyType(pixKey);
  const normalizedKey = normalizeC6PixKey(pixKey, detectedType);
  const valor = (args.amountCents / 100).toFixed(2);

  const payload = {
    valor,
    pagamentos: [
      {
        valor,
        descricao: (args.description || '').slice(0, 140),
        destinatario: {
          tipo: C6_PIX_KEY_TYPE_MAP[detectedType],
          chave: normalizedKey,
          ...(args.beneficiaryName ? { nome: args.beneficiaryName.slice(0, 200) } : {}),
          ...(args.beneficiaryDocument ? { cpfCnpj: String(args.beneficiaryDocument).replace(/\D/g, '') } : {}),
        },
      },
    ],
  };

  const endpoint = `${pixUrl.replace(/\/$/, '')}/pix/v2/pagamento`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal = globalThis as any;
  const startedAt = new Date().toISOString();
  let success = false;
  let providerPaymentId: string | undefined;
  let endToEndId: string | undefined;
  let errorMessage: string | undefined;

  try {
    const resp = await anyGlobal.fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-idempotency-key': args.idempotencyKey,
      },
      body: JSON.stringify(payload),
      agent,
    });

    const text = await resp.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

    if (resp.status >= 200 && resp.status <= 299) {
      success = true;
      providerPaymentId = String((json && (json.codigoSolicitacao || json.id || json.pagamentos?.[0]?.codigoSolicitacao)) || args.idempotencyKey);
      endToEndId = String(json?.endToEndId || json?.e2eid || '');
    } else {
      success = false;
      const detail =
        (Array.isArray(json?.violacoes) && json.violacoes.map((v: { razao?: string; mensagem?: string }) => v.razao || v.mensagem).join('; '))
        || (Array.isArray(json?.errors) && json.errors.map((e: { mensagem?: string; message?: string }) => e.mensagem || e.message).join('; '))
        || json?.mensagem
        || json?.message
        || text
        || `HTTP ${resp.status}`;
      errorMessage = `[C6 Bank] ${detail}`;
    }
  } catch (err) {
    success = false;
    errorMessage = err instanceof Error ? `[C6 Bank] ${err.message}` : String(err);
  }

  return {
    idempotencyKey: args.idempotencyKey,
    success,
    amountCents: args.amountCents,
    pixKey: args.pixKey,
    providerPaymentId,
    endToEndId: endToEndId || undefined,
    errorMessage,
  };
}

export async function executeC6BatchTransferQueue(
  creds: C6ConnectionCredentials,
  items: BaseExecuteSingleArgs[],
  opts?: { concurrency?: number; delayMs?: number; onProgress?: (done: number, total: number, result: TransferResultItem) => void },
): Promise<TransferResultItem[]> {
  const concurrency = opts?.concurrency ?? 1;
  const delayMs = opts?.delayMs ?? 120;
  const results: TransferResultItem[] = [];
  let processed = 0;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function worker(queue: BaseExecuteSingleArgs[]) {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const result = await executeC6PixTransfer(creds, item);
      results.push(result);
      processed += 1;
      opts?.onProgress?.(processed, items.length, result);
      if (queue.length > 0 && delayMs > 0) await delay(delayMs);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker(items.slice()));
  await Promise.all(workers);

  return results;
}
