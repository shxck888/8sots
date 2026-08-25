-- Employee schedule RLS integration test.
-- Run as a Supabase project owner in SQL Editor. Every fixture is rolled back.
-- A successful run returns one row with all booleans true, then ROLLBACK.

begin;

select set_config('test.schedule_tenant', id::text, true)
from public.tenants where slug = '8sots' limit 1;
select set_config('test.schedule_user', gen_random_uuid()::text, true);
select set_config('test.schedule_self_employee', gen_random_uuid()::text, true);
select set_config('test.schedule_other_employee', gen_random_uuid()::text, true);
select set_config('test.schedule_published', gen_random_uuid()::text, true);
select set_config('test.schedule_draft', gen_random_uuid()::text, true);

do $$
begin
  if current_setting('test.schedule_tenant', true) is null then
    raise exception 'production tenant fixture not found';
  end if;
end;
$$;

insert into auth.users (id, email, aud, role)
values (
  current_setting('test.schedule_user')::uuid,
  'employee-schedule-rls-fixture@auth.8sots.com.tw',
  'authenticated',
  'authenticated'
);

insert into public.tenant_memberships (tenant_id, user_id, status)
values (
  current_setting('test.schedule_tenant')::uuid,
  current_setting('test.schedule_user')::uuid,
  'active'
);

insert into public.employees (id, tenant_id, auth_user_id, employee_no, full_name, hire_date)
values (
  current_setting('test.schedule_self_employee')::uuid,
  current_setting('test.schedule_tenant')::uuid,
  current_setting('test.schedule_user')::uuid,
  'SCHEDULE-RLS-SELF',
  'Schedule RLS Self Fixture',
  current_date
), (
  current_setting('test.schedule_other_employee')::uuid,
  current_setting('test.schedule_tenant')::uuid,
  null,
  'SCHEDULE-RLS-OTHER',
  'Schedule RLS Other Fixture',
  current_date
);

insert into public.schedule_versions (
  id, tenant_id, period_start, period_end, version, status
) values (
  current_setting('test.schedule_published')::uuid,
  current_setting('test.schedule_tenant')::uuid,
  date '2099-01-01', date '2099-01-02', 1, 'draft'
), (
  current_setting('test.schedule_draft')::uuid,
  current_setting('test.schedule_tenant')::uuid,
  date '2099-01-03', date '2099-01-03', 1, 'draft'
);

insert into public.schedule_assignments (
  tenant_id, schedule_version_id, employee_id, work_date, shift_id
)
select current_setting('test.schedule_tenant')::uuid,
  current_setting('test.schedule_published')::uuid,
  current_setting('test.schedule_self_employee')::uuid,
  date '2099-01-01', s.id
from public.shifts s
where s.tenant_id = current_setting('test.schedule_tenant')::uuid
order by s.code
limit 1;

insert into public.schedule_assignments (
  tenant_id, schedule_version_id, employee_id, work_date, shift_id
)
select current_setting('test.schedule_tenant')::uuid,
  current_setting('test.schedule_published')::uuid,
  current_setting('test.schedule_other_employee')::uuid,
  date '2099-01-02', s.id
from public.shifts s
where s.tenant_id = current_setting('test.schedule_tenant')::uuid
order by s.code
limit 1;

insert into public.schedule_assignments (
  tenant_id, schedule_version_id, employee_id, work_date, shift_id
)
select current_setting('test.schedule_tenant')::uuid,
  current_setting('test.schedule_draft')::uuid,
  current_setting('test.schedule_self_employee')::uuid,
  date '2099-01-03', s.id
from public.shifts s
where s.tenant_id = current_setting('test.schedule_tenant')::uuid
order by s.code
limit 1;

update public.schedule_versions
set status = 'published',
    published_at = now(),
    published_by = current_setting('test.schedule_user')::uuid
where id = current_setting('test.schedule_published')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.schedule_user'), true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.schedule_assignments
  where schedule_version_id = current_setting('test.schedule_published')::uuid
    and employee_id = current_setting('test.schedule_self_employee')::uuid;
  if v_count <> 1 then raise exception 'employee published schedule read failed'; end if;

  select count(*) into v_count
  from public.schedule_assignments
  where schedule_version_id = current_setting('test.schedule_published')::uuid
    and employee_id = current_setting('test.schedule_other_employee')::uuid;
  if v_count <> 0 then raise exception 'other employee schedule leaked'; end if;

  select count(*) into v_count
  from public.schedule_assignments
  where schedule_version_id = current_setting('test.schedule_draft')::uuid;
  if v_count <> 0 then raise exception 'draft employee schedule leaked'; end if;
end;
$$;

reset role;

select
  true as self_published_visible,
  true as other_employee_blocked,
  true as draft_blocked;

rollback;
