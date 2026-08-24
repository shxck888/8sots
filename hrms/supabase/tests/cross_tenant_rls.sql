-- Cross-tenant security integration test.
-- Run as a Supabase project owner in SQL Editor. Every fixture is rolled back.
-- A successful run returns one row with all booleans true, then ROLLBACK.

begin;

-- SQL Editor has no Auth JWT, so resolve the production platform administrator
-- through versioned RBAC data rather than current_user_has_permission().
select set_config('test.tenant_a', t.id::text, true),
       set_config('test.user_a', tm.user_id::text, true)
from public.tenants t
join public.tenant_memberships tm
  on tm.tenant_id = t.id and tm.status = 'active'
join public.membership_roles mr
  on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
join public.roles r
  on r.tenant_id = mr.tenant_id and r.id = mr.role_id
join public.role_permissions rp
  on rp.tenant_id = r.tenant_id and rp.role_id = r.id
join public.permissions p on p.id = rp.permission_id
where t.slug = '8sots' and p.code = 'platform.admin'
limit 1;

do $$
begin
  if current_setting('test.tenant_a', true) is null
     or current_setting('test.user_a', true) is null then
    raise exception 'production tenant/platform administrator fixture not found';
  end if;
end;
$$;

insert into public.tenants (name, slug, timezone)
values ('RLS Integration Fixture', 'rls-integration-fixture', 'Asia/Taipei')
returning set_config('test.tenant_b', id::text, true);

-- Persist generated fixture IDs in transaction-local settings so assertions can
-- cross SET ROLE boundaries without creating permanent helper tables/functions.

insert into public.companies (tenant_id, name, tax_id)
values (current_setting('test.tenant_a')::uuid, 'Tenant A RLS Fixture', 'RLS-A')
returning set_config('test.company_a', id::text, true);

insert into public.companies (tenant_id, name, tax_id)
values (current_setting('test.tenant_b')::uuid, 'Tenant B RLS Fixture', 'RLS-B')
returning set_config('test.company_b', id::text, true);

insert into public.employees (
  tenant_id, employee_no, full_name, hire_date, status, notes
) values (
  current_setting('test.tenant_b')::uuid,
  'RLSB001', 'Cross Tenant Fixture', current_date, 'active', 'transaction-scoped fixture'
)
returning set_config('test.employee_b', id::text, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.tenants where id = current_setting('test.tenant_a')::uuid;
  if v_count <> 1 then raise exception 'same-tenant read failed'; end if;

  select count(*) into v_count
  from public.tenants where id = current_setting('test.tenant_b')::uuid;
  if v_count <> 0 then raise exception 'cross-tenant tenant read leaked'; end if;

  select count(*) into v_count
  from public.employees where id = current_setting('test.employee_b')::uuid;
  if v_count <> 0 then raise exception 'cross-tenant employee read leaked'; end if;

  begin
    insert into public.companies (tenant_id, name)
    values (current_setting('test.tenant_a')::uuid, 'Client Write Must Fail');
    raise exception 'authenticated client write unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.create_employee(
      current_setting('test.tenant_b')::uuid,
      'RLSB002', 'Cross Tenant RPC Must Fail', null, null, null,
      current_date, 'active', null
    );
    raise exception 'cross-tenant RPC unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    insert into public.locations (tenant_id, company_id, name, code)
    values (
      current_setting('test.tenant_b')::uuid,
      current_setting('test.company_a')::uuid,
      'Cross Tenant FK Must Fail', 'RLS-FK'
    );
    raise exception 'cross-tenant foreign key unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$$;

set local role anon;

do $$
begin
  begin
    perform count(*) from public.tenants;
    raise exception 'anonymous read unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  true as same_tenant_read,
  true as cross_tenant_read_blocked,
  true as authenticated_write_blocked,
  true as anonymous_access_blocked,
  true as cross_tenant_rpc_blocked,
  true as cross_tenant_fk_blocked;

rollback;
