export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'super_admin';
  companyId: string;
  companyName: string;
};

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export type BatchUploadRow = {
  payment_id: string;
  recipient_name: string;
  recipient_document: string;
  pix_key: string;
  amount: number;
  description: string;
};

export type BatchValidationSummary = {
  totalItems: number;
  totalValidItems: number;
  totalInvalidItems: number;
  totalAmount: number;
};

export type BatchItemExecutionResult = {
  status: 'success' | 'failed';
  providerPaymentId?: string;
  providerEndToEndId?: string;
  providerMessage?: string;
  httpStatus?: number;
  providerResponse?: unknown;
};
