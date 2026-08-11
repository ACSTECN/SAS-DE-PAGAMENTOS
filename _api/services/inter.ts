import { env } from '../lib/env.js';
import type { TransferResultItem, PixKeyType } from '../types/index.js';

export type InterEnvironment = 'sandbox' | 'production';

export const INTER_PIX_KEY_TYPE_MAP: Record<PixKeyType, 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'CHAVE_ALEATORIA'> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'EMAIL',
  PHONE: 'TELEFONE',
  EVP: 'CHAVE_ALEATORIA',
};

export interface InterConnectionCredentials {
  clientId: string;
  clientSecret: string;
  certificatePem: string;
  privateKeyPem: string;
  environment: InterEnvironment;
}

export interface InterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Detecta o tipo de chave PIX pelos padrões do Banco Inter (igual ao Asaas, mapeia para enum do Inter).
 */
export function detectInterPixKeyType(raw: string): PixKeyType {
  const key = String(raw || '').trim();
  const digits = key.replace(/\D/g, '');
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(key)) return 'EVP';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return 'EMAIL';
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  if (digits.length === 11 || (digits.length >= 10 && digits.length <= 13)) return 'PHONE';
  if (digits.length >= 6 && digits.length <= 15) return 'PHONE';
  return 'EVP';
}

export function normalizeInterPixKey(raw: string, type: PixKeyType): string {
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

export function resolveInterUrls(environment: InterEnvironment) {
  const cfg = env.inter;
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

/**
 * Monta o agente https com certificado mTLS do Inter (via fetch: precisamos enviar como Node https.Agent).
 * Como a Vercel runtime é Node, usamos node:https para construir o agent.
 */
async function buildInterAgent(certificatePem: string, privateKeyPem: string) {
  const https = await import('node:https');
  const crypto = await import('node:crypto');

  // Algumas vezes o usuario cola o certificado com espacos / quebras de linha perdidas.
  // As APIs do Node aceitam tanto \n quanto \r\n, mas para garantir, normalizamos as quebras.
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
    // Opcional: algumas contas do Inter pedem secureContext compartilhado.
    secureContext: crypto.createSecureContext({ cert, key }),
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
  });
}

/**
 * Gera token de acesso OAuth2 do Inter via client_credentials com escopo de pagamento Pix.
 */
export async function getInterAccessToken(creds: InterConnectionCredentials): Promise<string> {
  const { tokenUrl } = resolveInterUrls(creds.environment);
  const agent = await buildInterAgent(creds.certificatePem, creds.privateKeyPem);

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
    // @ts-expect-error agent nao existe no fetch lib do TS mas existe no node-fetch / undici da Vercel
    agent,
    dispatcher: undefined,
  });

  const text = await resp.text();
  let json: InterTokenResponse & { error?: string; error_description?: string } = {} as InterTokenResponse;
  try { json = JSON.parse(text); } catch { /* ignora */ }

  if (!resp.ok || !json.access_token) {
    const msg = json.error_description || json.error || text || `Falha ao obter token Inter (HTTP ${resp.status})`;
    throw new Error(`[Banco Inter] ${msg}`);
  }
  return json.access_token;
}

/**
 * Validação de conexão: apenas pega um token (se funcionar, credenciais + mTLS estão corretos).
 */
export async function validateInterConnection(creds: InterConnectionCredentials): Promise<{ valid: boolean; message: string }> {
  try {
    await getInterAccessToken(creds);
    return { valid: true, message: 'Conexão Banco Inter validada com sucesso (OAuth2 + mTLS ok).' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, message: msg };
  }
}

export interface ExecutePixTransferArgs {
  idempotencyKey: string;
  pixKey: string;
  amountCents: number;
  description?: string;
  beneficiaryName?: string;
  beneficiaryDocument?: string;
}

/**
 * Executa 1 transferencia Pix via API do Banco Inter.
 * Endpoint oficial: POST /pix/v2/pagamento
 */
export async function executeInterPixTransfer(
  creds: InterConnectionCredentials,
  args: ExecutePixTransferArgs,
): Promise<TransferResultItem> {
  const accessToken = await getInterAccessToken(creds);
  const { pixUrl } = resolveInterUrls(creds.environment);
  const agent = await buildInterAgent(creds.certificatePem, creds.privateKeyPem);

  const pixKey = args.pixKey.trim();
  const detectedType = detectInterPixKeyType(pixKey);
  const normalizedKey = normalizeInterPixKey(pixKey, detectedType);
  const valor = (args.amountCents / 100).toFixed(2);

  // Endpoint oficial Inter: POST {pixUrl}/pix/v2/pagamento com itens no array
  const payload = {
    valor,
    pagamentos: [
      {
        valor,
        descricao: (args.description || '').slice(0, 140),
        destinatario: {
          tipo: INTER_PIX_KEY_TYPE_MAP[detectedType],
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
  let finalStatus: TransferResultItem['status'] = 'pending';
  let providerPaymentId: string | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

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
      // @ts-expect-error agent disponivel no undici/Node fetch
      agent,
    });

    const text = await resp.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

    if (resp.status >= 200 && resp.status <= 299) {
      finalStatus = 'success';
      providerPaymentId = String((json && (json.codigoSolicitacao || json.id || json.pagamentos?.[0]?.codigoSolicitacao)) || args.idempotencyKey);
    } else {
      finalStatus = 'failed';
      errorCode = String((json && (json.codigo || json.status || resp.status)) || resp.status);
      const detail =
        (Array.isArray(json?.violacoes) && json.violacoes.map((v: { razao?: string; mensagem?: string }) => v.razao || v.mensagem).join('; '))
        || (Array.isArray(json?.errors) && json.errors.map((e: { mensagem?: string; message?: string }) => e.mensagem || e.message).join('; '))
        || json?.mensagem
        || json?.message
        || text
        || `HTTP ${resp.status}`;
      errorMessage = `[Banco Inter] ${detail}`;
    }
  } catch (err) {
    finalStatus = 'error';
    errorCode = 'exception';
    errorMessage = err instanceof Error ? `[Banco Inter] ${err.message}` : String(err);
  }

  return {
    idempotencyKey: args.idempotencyKey,
    amountCents: args.amountCents,
    status: finalStatus,
    provider_payment_id: providerPaymentId,
    error_code: errorCode,
    error_message: errorMessage,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    provider: 'inter',
  };
}

/**
 * Fila controlada igual ao serviço do Asaas (concorrencia 1, delay entre items).
 */
export async function executeInterBatchTransferQueue(
  creds: InterConnectionCredentials,
  items: Array<ExecutePixTransferArgs>,
  opts?: { concurrency?: number; delayMs?: number; onProgress?: (done: number, total: number, result: TransferResultItem) => void },
): Promise<TransferResultItem[]> {
  const concurrency = opts?.concurrency ?? 1;
  const delayMs = opts?.delayMs ?? 120;
  const results: TransferResultItem[] = [];
  let processed = 0;

  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function worker(queue: Array<ExecutePixTransferArgs>) {
    while (queue.length > 0) {
      const item = queue.shift()!;
      const result = await executeInterPixTransfer(creds, item);
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
