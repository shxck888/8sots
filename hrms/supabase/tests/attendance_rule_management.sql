-- Attendance rule set management RPC integration test.
-- Run as a Supabase project owner in SQL Editor. Every fixture is rolled back.
-- A successful run returns one row with all booleans true, then ROLLBACK.

begin;

select set_config('test.rule_tenant', id::text, true)
from public.tenants where slug = '8sots' limit 1;
select set_config('test.rule_user', gen_random_uuid()::text, true);
select set_config('test.rule_role', gen_random_uuid()::text, true);
select set_config('test.rule_membership', gen_random_uuid()::text, true);
select set_config('test.rule_outsider', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('test.rule_tenant', true) is null then
    raise exception 'production tenant fixture not found';
  end if;
end;
$$;

insert into auth.users (id, email, aud, role)
values (
  current_setting('test.rule_user')::uuid,
  'rule-fixture@auth.8sots.com.tw', 'authenticated', 'authenticated'
);

insert into public.tenant_memberships (id, tenant_id, user_id, status)
values (
  current_setting('test.rule_membership')::uuid,
  current_setting('test.rule_tenant')::uuid,
  current_setting('test.rule_user')::uuid,
  'active'
);

insert into public.roles (id, tenant_id, code, name)
values (
  current_setting('test.rule_role')::uuid,
  current_setting('test.rule_tenant')::uuid,
  'attendance_rule_fixture_role', 'Attendance Rule Fixture Role'
);

insert into public.role_permissions (tenant_id, role_id, permission_id)
select current_setting('test.rule_tenant')::uuid,
  current_setting('test.rule_role')::uuid, p.id
from public.permissions p where p.code = 'attendance.manage';

insert into public.membership_roles (tenant_id, membership_id, role_id, scope_type)
values (
  current_setting('test.rule_tenant')::uuid,
  current_setting('test.rule_membership')::uuid,
  current_setting('test.rule_role')::uuid,
  'tenant'
);

-- An outsider with an active membership but no attendance.manage permission.
insert into auth.users (id, email, aud, role)
values (
  current_setting('test.rule_outsider')::uuid,
  'rule-outsider@auth.8sots.com.tw', 'authenticated', 'authenticated'
);

insert into public.tenant_memberships (tenant_id, user_id, status)
values (
  current_setting('test.rule_tenant')::uuid,
  current_setting('test.rule_outsider')::uuid,
  'active'
);

set local role authenticated;

-- Authorized manager creates a new versioned rule set.
select set_config('request.jwt.claim.sub', current_setting('test.rule_user'), true);

do $$
declare
  v_id uuid;
  v_late integer;
  v_early integer;
  v_max_before integer;
  v_new_version integer;
begin
  select coalesce(max(version), 0) into v_max_before
  from public.attendance_rule_sets
  where tenant_id = current_setting('test.rule_tenant')::uuid;

  v_id := public.create_attendance_rule_set(
    current_setting('test.rule_tenant')::uuid, 5, 10, date '2099-01-01'
  );
  if v_id is null then raise exception 'rule set creation failed'; end if;

  select version, late_grace_minutes, early_leave_grace_minutes
  into v_new_version, v_late, v_early
  from public.attendance_rule_sets
  where id = v_id;
  if v_new_version <> v_max_before + 1 then raise exception 'rule set version was not incremented'; end if;
  if v_late <> 5 or v_early <> 10 then raise exception 'rule set grace minutes not stored'; end if;

  -- Out-of-range grace minutes are rejected.
  begin
    perform public.create_attendance_rule_set(
      current_setting('test.rule_tenant')::uuid, 999, 0, date '2099-02-01'
    );
    raise exception 'out-of-range rule set unexpectedly succeeded';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

-- Member without attendance.manage cannot create a rule set.
select set_config('request.jwt.claim.sub', current_setting('test.rule_outsider'), true);

do $$
begin
  begin
    perform public.create_attendance_rule_set(
      current_setting('test.rule_tenant')::uuid, 5, 5, date '2099-03-01'
    );
    raise exception 'unauthorized rule set write unexpectedly succeeded';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

reset role;

select
  true as authorized_versioned_create,
  true as out_of_range_blocked,
  true as unauthorized_write_blocked;

rollback;
