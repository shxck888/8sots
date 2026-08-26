-- Holiday calendar RLS and RPC integration test.
-- Run as a Supabase project owner in SQL Editor. Every fixture is rolled back.
-- A successful run returns one row with all booleans true, then ROLLBACK.

begin;

select set_config('test.holiday_tenant', id::text, true)
from public.tenants where slug = '8sots' limit 1;
select set_config('test.holiday_other_tenant', gen_random_uuid()::text, true);
select set_config('test.holiday_user', gen_random_uuid()::text, true);
select set_config('test.holiday_role', gen_random_uuid()::text, true);
select set_config('test.holiday_membership', gen_random_uuid()::text, true);
select set_config('test.holiday_outsider', gen_random_uuid()::text, true);
select set_config('test.holiday_outsider_membership', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('test.holiday_tenant', true) is null then
    raise exception 'production tenant fixture not found';
  end if;
end;
$$;

-- Authorized user in the production tenant, granted schedule.manage via a fixture role.
insert into auth.users (id, email, aud, role)
values (
  current_setting('test.holiday_user')::uuid,
  'holiday-fixture@auth.8sots.com.tw', 'authenticated', 'authenticated'
);

insert into public.tenant_memberships (id, tenant_id, user_id, status)
values (
  current_setting('test.holiday_membership')::uuid,
  current_setting('test.holiday_tenant')::uuid,
  current_setting('test.holiday_user')::uuid,
  'active'
);

insert into public.roles (id, tenant_id, code, name)
values (
  current_setting('test.holiday_role')::uuid,
  current_setting('test.holiday_tenant')::uuid,
  'holiday_fixture_role', 'Holiday Fixture Role'
);

insert into public.role_permissions (tenant_id, role_id, permission_id)
select current_setting('test.holiday_tenant')::uuid,
  current_setting('test.holiday_role')::uuid, p.id
from public.permissions p where p.code = 'schedule.manage';

insert into public.membership_roles (tenant_id, membership_id, role_id, scope_type)
values (
  current_setting('test.holiday_tenant')::uuid,
  current_setting('test.holiday_membership')::uuid,
  current_setting('test.holiday_role')::uuid,
  'tenant'
);

-- An outsider in a separate tenant, used for cross-tenant isolation checks.
insert into public.tenants (id, name, slug)
values (
  current_setting('test.holiday_other_tenant')::uuid,
  'Holiday Test Tenant', 'holiday-test-fixture'
);

insert into auth.users (id, email, aud, role)
values (
  current_setting('test.holiday_outsider')::uuid,
  'holiday-outsider@auth.8sots.com.tw', 'authenticated', 'authenticated'
);

insert into public.tenant_memberships (id, tenant_id, user_id, status)
values (
  current_setting('test.holiday_outsider_membership')::uuid,
  current_setting('test.holiday_other_tenant')::uuid,
  current_setting('test.holiday_outsider')::uuid,
  'active'
);

set local role authenticated;

-- Authorized upsert, read-back, and duplicate-date update.
select set_config('request.jwt.claim.sub', current_setting('test.holiday_user'), true);

do $$
declare
  v_id uuid;
  v_name text;
  v_count integer;
begin
  v_id := public.upsert_holiday_entry(
    current_setting('test.holiday_tenant')::uuid,
    date '2099-10-10', '國慶日', 'national', ''
  );
  if v_id is null then raise exception 'holiday upsert failed'; end if;

  select count(*) into v_count
  from public.holiday_calendar_entries
  where tenant_id = current_setting('test.holiday_tenant')::uuid
    and holiday_date = date '2099-10-10';
  if v_count <> 1 then raise exception 'holiday not readable by owner tenant'; end if;

  perform public.upsert_holiday_entry(
    current_setting('test.holiday_tenant')::uuid,
    date '2099-10-10', '國慶連假', 'company', '調整名稱'
  );
  select name into v_name
  from public.holiday_calendar_entries
  where tenant_id = current_setting('test.holiday_tenant')::uuid
    and holiday_date = date '2099-10-10';
  if v_name <> '國慶連假' then raise exception 'holiday duplicate date did not update'; end if;
end;
$$;

-- Outsider in another tenant must not read or write the holiday.
select set_config('request.jwt.claim.sub', current_setting('test.holiday_outsider'), true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.holiday_calendar_entries
  where holiday_date = date '2099-10-10';
  if v_count <> 0 then raise exception 'cross-tenant holiday leaked'; end if;

  begin
    perform public.upsert_holiday_entry(
      current_setting('test.holiday_tenant')::uuid,
      date '2099-12-25', '耶誕', 'company', ''
    );
    raise exception 'unauthorized holiday write unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

reset role;

select
  true as authorized_upsert,
  true as duplicate_date_updated,
  true as cross_tenant_blocked,
  true as unauthorized_write_blocked;

rollback;
