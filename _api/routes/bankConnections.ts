import { Router, type Response } from 'express';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, requireTenantUser, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue, encryptSensitiveValue } from '../lib/crypto.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  decryptConnection,
  encryptConnectionForInsert,
  validateConnectionUnified,
  getProviderDisplay,
  type BankProvider,
} from '../services/bankProvider.js';

const router = Router();

router.use(requireAuth);
router.use(requireTenantUser);

type ConnectionRow = {
  id: string;
  company_id: string;
  bank_code: string;
  display_name: string | null;
  environment: 'sandbox' | 'production';
  status: 'pending' | 'validated' | 'error';
  last_tested_at: string | null;
  validation_message: string | null;
  api_key_encrypted: string | null;
  client_id_encrypted: string | null;
  client_secret_encrypted: string | null;
  certificate_encrypted: string | null;
  private_key_encrypted: string | null;
};

function toEnvironmentLabel(environment: 'sandbox' | 'production') {
  return environment === 'production' ? 'produção' : 'sandbox';
}

function assertValidProvider(p: unknown): BankProvider {
  if (p === 'asaas' || p === 'inter') return p as BankProvider;
  throw new ApiError(400, 'Provedor bancário inválido. Selecione Asaas ou Banco Inter.');
}

async function loadAnyConnection(companyId: string, provider?: BankProvider | null): Promise<ConnectionRow | null> {
  const query = supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId);

  if (provider) query.eq('bank_code', provider);
  query.order('updated_at', { ascending: false }).limit(1);

  const { data, error } = await query;
  if (error) throw new ApiError(500, 'Falha ao carregar conexão bancária.');
  return (Array.isArray(data) && data.length > 0 ? (data[0] as ConnectionRow) : null) || null;
}

async function markStatus(
  connectionId: string,
  status: 'validated' | 'error',
  message?: string | null,
) {
  await supabaseAdmin
    .from('bank_connections')
    .update({
      status,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      validation_message: message || null,
    })
    .eq('id', connectionId);
}

function summarizeStoredSecrets(conn: ConnectionRow) {
  const secretOf = (v: string | null) => {
    if (!v) return false;
    try {
      const raw = decryptSensitiveValue(v);
      return Boolean(raw && raw !== 'na');
    } catch {
      return false;
    }
  };
  return {
    hasApiKey: secretOf(conn.api_key_encrypted),
    hasClientId: secretOf(conn.client_id_encrypted),
    hasClientSecret: secretOf(conn.client_secret_encrypted),
    hasCertificate: secretOf(conn.certificate_encrypted),
    hasPrivateKey: secretOf(conn.private_key_encrypted),
  };
}

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadAnyConnection(req.currentUser!.companyId);
    if (!connection) {
      res.json({ success: true, provider: null, connection: null });
      return;
    }
    const provider = assertValidProvider(connection.bank_code);
    const secrets = summarizeStoredSecrets(connection);

    res.json({
      success: true,
      provider,
      displayName: getProviderDisplay(provider),
      connection: {
        id: connection.id,
        provider,
        bankCode: connection.bank_code,
        displayName: connection.display_name || getProviderDisplay(provider),
        environment: connection.environment,
        status: connection.status,
        lastTestedAt: connection.last_tested_at,
        validationMessage: connection.validation_message,
        ...secrets,
      },
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { provider, environment, apiKey, clientId, clientSecret, certificatePem, privateKeyPem } = req.body ?? {};
    const selectedProvider = assertValidProvider(provider);
    const selectedEnvironment: 'sandbox' | 'production' =
      environment === 'production' ? 'production' : 'sandbox';

    if (selectedProvider === 'asaas') {
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        throw new ApiError(400, 'Informe uma API Key válida do Asaas.');
      }
    } else {
      // Banco Inter: clientId, clientSecret, certificate, privateKey obrigatórios.
      if (!clientId || typeof clientId !== 'string' || clientId.trim().length < 4) {
        throw new ApiError(400, 'Informe o Client ID (Banco Inter).');
      }
      if (!clientSecret || typeof clientSecret !== 'string' || clientSecret.trim().length < 8) {
        throw new ApiError(400, 'Informe o Client Secret (Banco Inter).');
      }
      if (!certificatePem || typeof certificatePem !== 'string' || !certificatePem.includes('CERTIFICATE')) {
        throw new ApiError(400, 'Informe o certificado PEM completo da conta Banco Inter (inclui BEGIN CERTIFICATE).');
      }
      if (!privateKeyPem || typeof privateKeyPem !== 'string' || !privateKeyPem.includes('PRIVATE KEY')) {
        throw new ApiError(400, 'Informe a chave privada PEM completa da conta Banco Inter (inclui BEGIN PRIVATE KEY).');
      }
    }

    // Deleta conexao antiga da empresa, para nao ter misturado provider
    await supabaseAdmin.from('bank_connections').delete().eq('company_id', req.currentUser!.companyId);

    const encrypted = encryptConnectionForInsert({
      bank_code: selectedProvider,
      environment: selectedEnvironment,
      api_key_plain: selectedProvider === 'asaas' ? String(apiKey).trim() : null,
      client_id_plain: selectedProvider === 'inter' ? String(clientId).trim() : null,
      client_secret_plain: selectedProvider === 'inter' ? String(clientSecret).trim() : null,
      certificate_pem_plain: selectedProvider === 'inter' ? String(certificatePem).trim() : null,
      private_key_pem_plain: selectedProvider === 'inter' ? String(privateKeyPem).trim() : null,
    });

    const insertPayload = {
      company_id: req.currentUser!.companyId,
      bank_code: selectedProvider,
      display_name: getProviderDisplay(selectedProvider),
      environment: selectedEnvironment,
      client_id: selectedProvider === 'inter' ? String(clientId).trim() : 'na',
      client_id_encrypted: encrypted.client_id_encrypted!,
      client_secret_encrypted: encrypted.client_secret_encrypted!,
      certificate_encrypted: encrypted.certificate_encrypted!,
      private_key_encrypted: encrypted.private_key_encrypted!,
      token_url: null,
      payment_url: null,
      api_key_encrypted: encrypted.api_key_encrypted!,
      status: 'pending' as const,
      validation_message: null,
      updated_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabaseAdmin
      .from('bank_connections')
      .insert(insertPayload);
    if (insertError) throw new ApiError(400, insertError.message || 'Falha ao salvar conexão bancária.');

    const saved = await loadAnyConnection(req.currentUser!.companyId, selectedProvider);
    if (!saved) throw new ApiError(500, 'Falha ao recarregar conexão após salvar.');

    // Valida conexão real
    try {
      const decoded = decryptConnection(saved);
      if (!decoded) throw new ApiError(400, 'Não foi possível descriptografar a conexão salva.');
      const result = await validateConnectionUnified(decoded.provider, decoded.credentials, decoded.environment);
      if (!result.valid) throw new ApiError(400, result.message);
      await markStatus(saved.id, 'validated', result.message);
    } catch (validationError) {
      const message =
        validationError instanceof Error ? validationError.message : 'Falha ao validar conexão.';
      await markStatus(saved.id, 'error', message);
      throw new ApiError(400, message);
    }

    res.status(200).json({
      success: true,
      provider: selectedProvider,
      message: `${getProviderDisplay(selectedProvider)} conectado com sucesso no ambiente de ${toEnvironmentLabel(selectedEnvironment)}.`,
      environment: selectedEnvironment,
    });
  }),
);

router.post(
  '/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadAnyConnection(req.currentUser!.companyId);
    if (!connection) throw new ApiError(404, 'Configure uma conexão bancária antes de testar.');
    const provider = assertValidProvider(connection.bank_code);
    const decoded = decryptConnection(connection);
    if (!decoded) throw new ApiError(400, 'Não foi possível descriptografar as credenciais salvas.');

    try {
      const result = await validateConnectionUnified(decoded.provider, decoded.credentials, decoded.environment);
      if (!result.valid) throw new ApiError(400, result.message);
      await markStatus(connection.id, 'validated', result.message);
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : 'Falha ao validar conexão.';
      await markStatus(connection.id, 'error', message);
      throw new ApiError(400, message);
    }

    res.json({
      success: true,
      provider,
      message: `Conexão ${getProviderDisplay(provider)} validada com sucesso no ambiente de ${toEnvironmentLabel(connection.environment)}.`,
      environment: connection.environment,
    });
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadAnyConnection(req.currentUser!.companyId);
    if (!connection) throw new ApiError(404, 'Nenhuma conexão bancária encontrada.');

    const { error } = await supabaseAdmin
      .from('bank_connections')
      .delete()
      .eq('id', connection.id);
    if (error) throw new ApiError(400, error.message || 'Falha ao remover conexão.');

    res.json({
      success: true,
      provider: connection.bank_code,
      message: 'Conexão removida com sucesso.',
    });
  }),
);

export default router;
