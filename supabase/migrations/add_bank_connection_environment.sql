alter table bank_connections
  add column if not exists environment text not null default 'sandbox';

alter table bank_connections
  add column if not exists validation_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bank_connections_environment_check'
  ) then
    alter table bank_connections
      add constraint bank_connections_environment_check
      check (environment in ('sandbox', 'production'));
  end if;
end $$;

update bank_connections
set
  environment = coalesce(nullif(environment, ''), 'sandbox'),
  validation_message = coalesce(validation_message, null);
