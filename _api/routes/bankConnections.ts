import { Router, type Response } from 'express';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, requireTenantUser, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue, encryptSensitiveValue } from '../lib/crypto.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { validateAsaasConnection } from '../services/asaas.js';

const router = Router();

router.use(requireAuth);
router.use(requireTenantUser);

type AsaasConnectionRow = {
  id: string;
  bank_code: 'asaas';
  display_name: string;
  environment: 'sandbox' | 'production';
  status: 'pending' | 'validated' | 'error';
  last_tested_at: string | null;
  validation_message: string | null;
  api_key_encrypted?: string | null;
  client_secret_encrypted?: string | null;
};

function toEnvironmentLabel(environment: 'sandbox' | 'production') {
  return environment === 'production' ? 'produção' : 'sandbox';
}

async function loadAsaasConnection(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_code', 'asaas')
    .maybeSingle();

  if (error) throw new ApiError(500, 'Falha ao carregar conexão com Asaas.');
  return data as unknown as AsaasConnectionRow | null;
}

async function markAsaasStatus(
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

function getAsaasApiKey(conn: AsaasConnectionRow): string {
  if (conn.api_key_encrypted) return decryptSensitiveValue(conn.api_key_encrypted);
  if (conn.client_secret_encrypted) return decryptSensitiveValue(conn.client_secret_encrypted);
  throw new ApiError(400, 'API Key da Asaas não foi configurada para esta empresa.');
}

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadAsaasConnection(req.currentUser!.companyId);

    res.json({
      success: true,
      provider: 'asaas',
      connection: connection
        ? {
            id: connection.id,
            displayName: connection.display_name,
            environment: connection.environment,
            status: connection.status,
            lastTestedAt: connection.last_tested_at,
            validationMessage: connection.validation_message,
            hasApiKey: Boolean(
              connection.api_key_encrypted || connection.client_secret_encrypted,
            ),
          }
        : null,
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { apiKey, environment } = req.body ?? {};
    const selectedEnvironment: 'sandbox' | 'production' =
      environment === 'production' ? 'production' : 'sandbox';

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
      throw new ApiError(400, 'Informe uma API Key válida do Asaas.');
    }

    const trimmedKey = apiKey.trim();
    const encryptedApiKey = encryptSensitiveValue(trimmedKey);

    const payload = {
      company_id: req.currentUser!.companyId,
      bank_code: 'asaas' as const,
      display_name: 'Conta Asaas principal',
      environment: selectedEnvironment,
      client_id: 'asaas',
      client_secret_encrypted: encryptedApiKey,
      certificate_encrypted: encryptSensitiveValue('na'),
      private_key_encrypted: encryptSensitiveValue('na'),
      token_url: `https://${selectedEnvironment === 'production' ? 'www' : 'sandbox'}.asaas.com/api/v3/transfers`,
      payment_url: `https://${selectedEnvironment === 'production' ? 'www' : 'sandbox'}.asaas.com/api/v3/transfers`,
      api_key_encrypted: encryptedApiKey,
      status: 'pending' as const,
      validation_message: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('bank_connections').upsert(payload, {
      onConflict: 'company_id,bank_code',
    });

    if (error) throw new ApiError(400, error.message || 'Falha ao salvar conexão Asaas.');

    const saved = await loadAsaasConnection(req.currentUser!.companyId);
    if (!saved) throw new ApiError(500, 'Falha ao recarregar conexão Asaas após salvar.');

    try {
      await validateAsaasConnection({
        apiKey: getAsaasApiKey(saved),
        environment: selectedEnvironment,
      });
      await markAsaasStatus(saved.id, 'validated', 'Conexão Asaas validada com sucesso.');
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Falha ao validar conexão Asaas.';
      await markAsaasStatus(saved.id, 'error', message);
      throw new ApiError(400, message);
    }

    res.json({
      success: true,
      message: `Asaas conectado com sucesso no ambiente de ${toEnvironmentLabel(selectedEnvironment)}.`,
      environment: selectedEnvironment,
    });
  }),
);

router.post(
  '/test',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadAsaasConnection(req.currentUser!.companyId);
    if (!connection) throw new ApiError(404, 'Configure a conexão Asaas antes de testar.');

    try {
      await validateAsaasConnection({
        apiKey: getAsaasApiKey(connection),
        environment: connection.environment,
      });
      await markAsaasStatus(connection.id, 'validated', 'Conexão validada com sucesso.');
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Falha ao validar Asaas.';
      await markAsaasStatus(connection.id, 'error', message);
      throw new ApiError(400, message);
    }

    res.json({
      success: true,
      message: `Conexão Asaas validada com sucesso no ambiente de ${toEnvironmentLabel(connection.environment)}.`,
      environment: connection.environment,
    });
  }),
);

router.delete(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadAsaasConnection(req.currentUser!.companyId);
    if (!connection) throw new ApiError(404, 'Nenhuma conexão Asaas encontrada.');

    const { error } = await supabaseAdmin
      .from('bank_connections')
      .delete()
      .eq('id', connection.id);

    if (error) throw new ApiError(400, error.message || 'Falha ao remover conexão Asaas.');

    res.json({
      success: true,
      message: 'Conexão Asaas removida com sucesso.',
    });
  }),
);

export default router;
