import dotenv from 'dotenv';

dotenv.config();

const fallbackEncryptionKey = 'change-this-development-key-32-bytes!';
export type AsaasRuntimeEnvironment = 'sandbox' | 'production';
export type InterRuntimeEnvironment = 'sandbox' | 'production';

export const env = {
  port: Number(process.env.PORT || 3001),
  appUrl: process.env.VITE_APP_URL || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  encryptionKey: (process.env.APP_ENCRYPTION_KEY || fallbackEncryptionKey).padEnd(32, '0').slice(0, 32),
  asaas: {
    sandboxBaseUrl:
      process.env.ASAAS_SANDBOX_BASE_URL || 'https://sandbox.asaas.com/api/v3',
    productionBaseUrl:
      process.env.ASAAS_PRODUCTION_BASE_URL || 'https://www.asaas.com/api/v3',
  },
  c6: {
    sandboxTokenUrl:
      process.env.C6_SANDBOX_TOKEN_URL ||
      'https://apix-sandbox.c6bank.com.br/oauth/v2/token',
    sandboxPixUrl:
      process.env.C6_SANDBOX_PIX_URL ||
      'https://apix-sandbox.c6bank.com.br',
    productionTokenUrl:
      process.env.C6_PRODUCTION_TOKEN_URL ||
      'https://apix.c6bank.com.br/oauth/v2/token',
    productionPixUrl:
      process.env.C6_PRODUCTION_PIX_URL ||
      'https://apix.c6bank.com.br',
  },
  inter: {
    sandboxTokenUrl:
      process.env.INTER_SANDBOX_TOKEN_URL ||
      'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
    sandboxPixUrl:
      process.env.INTER_SANDBOX_PIX_URL ||
      'https://cdpj.partners.bancointer.com.br',
    productionTokenUrl:
      process.env.INTER_PRODUCTION_TOKEN_URL ||
      'https://apis.bancointer.com.br/oauth/v2/token',
    productionPixUrl:
      process.env.INTER_PRODUCTION_PIX_URL ||
      'https://apis.bancointer.com.br',
  },
  mockBankMode: process.env.MOCK_BANK_MODE === 'true',
};

export function ensureBackendEnv() {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push('SUPABASE_URL');
  if (!env.supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    throw new Error(
      'Configuração obrigatória ausente na Vercel: adicione as seguintes Environment Variables e faça Redeploy → ' +
        missing.join(', '),
    );
  }
}
