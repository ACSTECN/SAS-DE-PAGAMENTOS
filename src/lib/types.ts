export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  companyId: string;
  companyName: string;
};

export type AppSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export type BankConnection = {
  id: string;
  displayName: string;
  provider: 'asaas';
  environment: 'sandbox' | 'production';
  status: 'pending' | 'validated' | 'error';
  lastTestedAt?: string;
  validationMessage?: string;
  hasApiKey: boolean;
};

export type Batch = {
  id: string;
  origin: 'upload' | 'manual';
  file_name: string;
  status:
    | 'draft'
    | 'validated'
    | 'confirmed'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'partial';
  total_items: number;
  total_valid_items: number;
  total_invalid_items: number;
  total_amount: number;
  created_at: string;
  confirmed_at?: string;
  processed_at?: string;
};

export type BatchItem = {
  id: string;
  payment_id: string;
  recipient_name: string;
  recipient_document: string;
  pix_key: string;
  amount: number;
  description?: string;
  status: 'pending' | 'valid' | 'invalid' | 'success' | 'failed';
  error_message?: string;
  provider_payment_id?: string;
  provider_end_to_end_id?: string;
  processed_at?: string;
};

export type BatchProgress = {
  total: number;
  success: number;
  failed: number;
  pending: number;
};
