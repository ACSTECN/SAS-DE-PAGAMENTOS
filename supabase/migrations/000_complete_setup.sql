-- ============================================================
-- SCRIPT COMPLETO DE SETUP DO SUPABASE - SAS DE PAGAMENTOS
-- Execute TODO esse script no SQL Editor do seu Supabase
-- Ordem: 1) Extensões 2) Tabelas 3) RLS 4) Triggers 5) Policies
-- ============================================================

-- 1) EXTENSÕES
create extension if not exists "pgcrypto";

-- ============================================================
-- 2) TABELAS PRINCIPAIS
-- ============================================================

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('admin', 'operator', 'super_admin')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists bank_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  bank_code text not null default 'asaas' check (bank_code = 'asaas'),
  display_name text not null default 'Conta Asaas principal',
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  client_id text,
  client_secret_encrypted text,
  certificate_encrypted text,
  private_key_encrypted text,
  token_url text,
  payment_url text,
  api_key_encrypted text,
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
  status text not null default 'draft' check (status in ('draft', 'validated', 'confirmed', 'processing', 'completed', 'failed', 'partial')),
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

-- ============================================================
-- 3) HABILITAR ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ============================================================

alter table companies enable row level security;
alter table users enable row level security;
alter table company_users enable row level security;
alter table bank_connections enable row level security;
alter table batches enable row level security;
alter table batch_items enable row level security;
alter table payment_attempts enable row level security;

-- ============================================================
-- 4) FUNÇÃO HELPER: PEGA company_id DO USUÁRIO LOGADO
-- ============================================================

create or replace function public.get_current_company_id()
returns uuid
language sql
stable
as $$
  select company_id
  from public.company_users
  where user_id = auth.uid()
  limit 1;
$$;

-- ============================================================
-- 5) RLS POLICIES - ACESSO POR EMPRESA
-- ============================================================

-- COMPANIES: Usuário só vê sua própria empresa
drop policy if exists "companies_select_own" on companies;
create policy "companies_select_own" on companies
  for select
  using (
    id = public.get_current_company_id()
  );

-- USERS: Usuário só vê usuários da sua empresa
drop policy if exists "users_select_company" on users;
create policy "users_select_company" on users
  for select
  using (
    id in (
      select user_id
      from public.company_users
      where company_id = public.get_current_company_id()
    )
  );

-- COMPANY_USERS: Usuário só vê vínculos da sua empresa
drop policy if exists "company_users_select_own" on company_users;
create policy "company_users_select_own" on company_users
  for select
  using (
    company_id = public.get_current_company_id()
  );

-- BANK_CONNECTIONS: Usuário só vê conexões da sua empresa
drop policy if exists "bank_connections_select_own" on bank_connections;
create policy "bank_connections_select_own" on bank_connections
  for select
  using (
    company_id = public.get_current_company_id()
  );

drop policy if exists "bank_connections_write_own" on bank_connections;
create policy "bank_connections_write_own" on bank_connections
  for all
  using (
    company_id = public.get_current_company_id()
  )
  with check (
    company_id = public.get_current_company_id()
  );

-- BATCHES: Usuário só vê lotes da sua empresa
drop policy if exists "batches_select_own" on batches;
create policy "batches_select_own" on batches
  for select
  using (
    company_id = public.get_current_company_id()
  );

drop policy if exists "batches_insert_own" on batches;
create policy "batches_insert_own" on batches
  for insert
  with check (
    company_id = public.get_current_company_id()
  );

drop policy if exists "batches_update_own" on batches;
create policy "batches_update_own" on batches
  for update
  using (
    company_id = public.get_current_company_id()
  )
  with check (
    company_id = public.get_current_company_id()
  );

-- BATCH_ITENS: Usuário só vê itens de lotes da sua empresa
drop policy if exists "batch_items_select_own" on batch_items;
create policy "batch_items_select_own" on batch_items
  for select
  using (
    batch_id in (
      select id from public.batches
      where company_id = public.get_current_company_id()
    )
  );

drop policy if exists "batch_items_write_own" on batch_items;
create policy "batch_items_write_own" on batch_items
  for all
  using (
    batch_id in (
      select id from public.batches
      where company_id = public.get_current_company_id()
    )
  )
  with check (
    batch_id in (
      select id from public.batches
      where company_id = public.get_current_company_id()
    )
  );

-- PAYMENT_ATTEMPTS: Usuário só vê tentativas de itens da sua empresa
drop policy if exists "payment_attempts_select_own" on payment_attempts;
create policy "payment_attempts_select_own" on payment_attempts
  for select
  using (
    batch_item_id in (
      select bi.id
      from public.batch_items bi
      join public.batches b on b.id = bi.batch_id
      where b.company_id = public.get_current_company_id()
    )
  );

-- ============================================================
-- 6) TRIGGER: SINCRONIZA auth.users -> public.users
-- Quando o registro do usuário é criado no auth, cria no public
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Cria o registro na tabela public.users com os dados básicos
  -- Obs: name e company assignment são feitos pelo backend no /register-company
  -- Esse trigger é um fallback caso o usuário seja criado de outra forma
  insert into public.users (id, name, email, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 7) GRANT: Permissões básicas para usuários autenticados
-- Obs: O backend usa SERVICE ROLE KEY que bypassa tudo
-- Essas grants são para acesso direto via anon key (caso use no futuro)
-- ============================================================

grant usage on schema public to anon, authenticated;
grant select on public.companies to authenticated;
grant select on public.users to authenticated;
grant select on public.company_users to authenticated;
grant all on public.bank_connections to authenticated;
grant all on public.batches to authenticated;
grant all on public.batch_items to authenticated;
grant select on public.payment_attempts to authenticated;

-- ============================================================
-- 8) FUNÇÃO: ATUALIZA updated_at AUTOMATICAMENTE
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bank_connections_updated_at on bank_connections;
create trigger set_bank_connections_updated_at
  before update on bank_connections
  for each row execute function public.handle_updated_at();

-- ============================================================
-- SCRIPT EXECUTADO COM SUCESSO!
-- ============================================================
