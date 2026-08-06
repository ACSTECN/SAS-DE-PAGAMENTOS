create extension if not exists "pgcrypto";

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'operator')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists bank_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  bank_code text not null default 'inter',
  display_name text not null default 'Conta Banco Inter principal',
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  client_id text not null,
  client_secret_encrypted text not null,
  certificate_encrypted text not null,
  private_key_encrypted text not null,
  token_url text not null,
  payment_url text not null,
  status text not null default 'pending' check (status in ('pending', 'validated', 'error')),
  validation_message text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, bank_code)
);

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  created_by uuid not null references users(id),
  bank_connection_id uuid not null references bank_connections(id),
  origin text not null default 'upload' check (origin in ('upload', 'manual')),
  file_name text not null,
  status text not null default 'draft' check (status in ('draft', 'validated', 'confirmed', 'processing', 'completed', 'failed')),
  total_items integer not null default 0,
  total_valid_items integer not null default 0,
  total_invalid_items integer not null default 0,
  total_amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  processed_at timestamptz
);

create index if not exists ix_batches_company_created_at
  on batches (company_id, created_at desc);

create table if not exists batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batches(id) on delete cascade,
  payment_id text not null,
  recipient_name text not null,
  recipient_document text not null,
  pix_key text not null,
  amount numeric(18,2) not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'valid', 'invalid', 'success', 'failed')),
  error_message text,
  provider_payment_id text,
  provider_end_to_end_id text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_batch_items_batch_payment_id
  on batch_items (batch_id, payment_id);

create index if not exists ix_batch_items_batch_id
  on batch_items (batch_id);

create table if not exists payment_attempts (
  id uuid primary key default gen_random_uuid(),
  batch_item_id uuid not null references batch_items(id) on delete cascade,
  idempotency_key text not null,
  status text not null,
  http_status integer,
  provider_message text,
  provider_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ix_payment_attempts_batch_item_id
  on payment_attempts (batch_item_id, created_at desc);
