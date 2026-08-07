import dotenv from 'dotenv';

dotenv.config();

const fallbackEncryptionKey = 'change-this-development-key-32-bytes!';
export type AsaasRuntimeEnvironment = 'sandbox' | 'production';

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

