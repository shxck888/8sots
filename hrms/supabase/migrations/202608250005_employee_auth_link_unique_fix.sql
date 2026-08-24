begin;

-- Multiple employees may exist before they receive an Auth account. Only an
-- actual, non-null Auth link must be unique inside a tenant.
alter table public.employees
  drop constraint if exists employees_tenant_id_auth_user_id_key;

create unique index if not exists employees_tenant_auth_user_unique_idx
  on public.employees (tenant_id, auth_user_id)
  where auth_user_id is not null;

commit;
