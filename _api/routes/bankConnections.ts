import { Router, type Response } from 'express';
import { ApiError, asyncHandler } from '../lib/api-error.js';
import { requireAuth, type AuthenticatedRequest } from '../lib/auth.js';
import { decryptSensitiveValue, encryptSensitiveValue } from '../lib/crypto.js';
import {
  resolveInterEnvironmentUrls,
  type InterRuntimeEnvironment,
} from '../lib/env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requestInterToken } from '../services/inter.js';

const router = Router();

async function loadConnection(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('bank_connections')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_code', 'inter')
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Falha ao carregar conexão bancária.');
  }

  return data;
}

function toEnvironmentLabel(environment: InterRuntimeEnvironment) {
  return environment === 'production' ? 'produção' : 'sandbox';
}

async function markConnectionStatus(
  connectionId: string,
  status: 'validated' | 'error',
  message?: string,
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

async function validateConnection(connection: {
  id: string;
  client_id: string;
  client_secret_encrypted: string;
  certificate_encrypted: string;
  private_key_encrypted: string;
  token_url: string;
  payment_url: string;
}) {
  try {
    await requestInterToken({
      clientId: connection.client_id,
      clientSecret: decryptSensitiveValue(connection.client_secret_encrypted),
      certificate: decryptSensitiveValue(connection.certificate_encrypted),
      privateKey: decryptSensitiveValue(connection.private_key_encrypted),
      tokenUrl: connection.token_url,
      paymentUrl: connection.payment_url,
    });

    await markConnectionStatus(connection.id, 'validated', 'Conexão validada com sucesso.');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao validar a conexão do Banco Inter.';

    await markConnectionStatus(connection.id, 'error', message);
    throw error;
  }
}

router.get(
  '/inter',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadConnection(req.currentUser!.companyId);

    res.json({
      success: true,
      connection: connection
        ? {
            id: connection.id,
            displayName: connection.display_name,
            clientId: connection.client_id,
            environment: connection.environment,
            status: connection.status,
            lastTestedAt: connection.last_tested_at,
            validationMessage: connection.validation_message,
            hasSecret: true,
            hasCertificate: true,
            hasPrivateKey: true,
          }
        : null,
    });
  }),
);

router.post(
  '/inter',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { clientId, clientSecret, certificate, privateKey, environment } =
      req.body ?? {};
    const selectedEnvironment =
      environment === 'production' ? 'production' : 'sandbox';

    if (!clientId || !clientSecret || !certificate || !privateKey) {
      throw new ApiError(400, 'Preencha Client ID, Client Secret, certificado PEM e chave privada PEM.');
    }

    const urls = resolveInterEnvironmentUrls(selectedEnvironment);

    const payload = {
      company_id: req.currentUser!.companyId,
      bank_code: 'inter',
      display_name: 'Conta Banco Inter principal',
      environment: selectedEnvironment,
      client_id: clientId,
      client_secret_encrypted: encryptSensitiveValue(clientSecret),
      certificate_encrypted: encryptSensitiveValue(certificate),
      private_key_encrypted: encryptSensitiveValue(privateKey),
      token_url: urls.tokenUrl,
      payment_url: urls.paymentUrl,
      status: 'pending',
      validation_message: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('bank_connections').upsert(payload, {
      onConflict: 'company_id,bank_code',
    });

    if (error) {
      throw new ApiError(400, error.message || 'Falha ao salvar conexão bancária.');
    }

    const savedConnection = await loadConnection(req.currentUser!.companyId);

    if (!savedConnection) {
      throw new ApiError(500, 'Falha ao recarregar a conexão do Banco Inter após salvar.');
    }

    await validateConnection(savedConnection);

    res.json({
      success: true,
      message: `Banco Inter conectado com sucesso no ambiente de ${toEnvironmentLabel(selectedEnvironment)}.`,
    });
  }),
);

router.post(
  '/inter/test',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const connection = await loadConnection(req.currentUser!.companyId);

    if (!connection) {
      throw new ApiError(404, 'Configure a conexão bancária antes de testar.');
    }

    await validateConnection(connection);

    res.json({
      success: true,
      message: `Conexão com o Banco Inter validada com sucesso no ambiente de ${toEnvironmentLabel(connection.environment)}.`,
    });
  }),
);

export default router;
