import dotenv from 'dotenv';

dotenv.config();

const fallbackEncryptionKey = 'change-this-development-key-32-bytes!';
export type InterRuntimeEnvironment = 'sandbox' | 'production';

export const env = {
  port: Number(process.env.PORT || 3001),
  appUrl: process.env.VITE_APP_URL || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  encryptionKey: (process.env.APP_ENCRYPTION_KEY || fallbackEncryptionKey).padEnd(32, '0').slice(0, 32),
  interSandboxTokenUrl:
    process.env.INTER_SANDBOX_TOKEN_URL || process.env.INTER_TOKEN_URL || '',
  interSandboxPaymentUrl:
    process.env.INTER_SANDBOX_PIX_URL || process.env.INTER_PIX_URL || '',
  interProductionTokenUrl:
    process.env.INTER_PRODUCTION_TOKEN_URL || process.env.INTER_TOKEN_URL || '',
  interProductionPaymentUrl:
    process.env.INTER_PRODUCTION_PIX_URL || process.env.INTER_PIX_URL || '',
  mockBankMode: process.env.MOCK_BANK_MODE === 'true',
};

export function resolveInterEnvironmentUrls(environment: InterRuntimeEnvironment) {
  if (environment === 'sandbox') {
    if (!env.interSandboxTokenUrl || !env.interSandboxPaymentUrl) {
      throw new Error('As URLs internas do ambiente sandbox do Banco Inter não estão configuradas.');
    }

    return {
      tokenUrl: env.interSandboxTokenUrl,
      paymentUrl: env.interSandboxPaymentUrl,
    };
  }

  if (!env.interProductionTokenUrl || !env.interProductionPaymentUrl) {
    throw new Error('As URLs internas do ambiente de produção do Banco Inter não estão configuradas.');
  }

  return {
    tokenUrl: env.interProductionTokenUrl,
    paymentUrl: env.interProductionPaymentUrl,
  };
}

export function ensureBackendEnv() {
  if (!env.supabaseUrl || !env.supabaseAnonKey || !env.supabaseServiceRoleKey) {
    throw new Error('Supabase não configurado. Defina SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.');
  }
}
