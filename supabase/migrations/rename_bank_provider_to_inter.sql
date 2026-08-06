update bank_connections
set
  bank_code = 'inter',
  display_name = case
    when display_name = 'Conta Itaú principal' then 'Conta Banco Inter principal'
    else display_name
  end,
  updated_at = now()
where bank_code = 'itau';

alter table bank_connections
  alter column bank_code set default 'inter';

alter table bank_connections
  alter column display_name set default 'Conta Banco Inter principal';
