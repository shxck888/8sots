-- Attendance calculation and correction integration test.
-- Run as project owner after migration 202608250014. All fixtures roll back.

begin;

select set_config('test.att_tenant', t.id::text, true),
       set_config('test.att_admin', tm.user_id::text, true)
from public.tenants t
join public.tenant_memberships tm on tm.tenant_id = t.id and tm.status = 'active'
join public.membership_roles mr on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
join public.roles r on r.tenant_id = mr.tenant_id and r.id = mr.role_id
join public.role_permissions rp on rp.tenant_id = r.tenant_id and rp.role_id = r.id
join public.permissions p on p.id = rp.permission_id
where t.slug = '8sots' and p.code = 'attendance.manage'
limit 1;
select set_config('test.att_user', gen_random_uuid()::text, true);
select set_config('test.att_employee', gen_random_uuid()::text, true);

do $$ begin
  if current_setting('test.att_tenant', true) is null then
    raise exception 'production attendance administrator fixture not found';
  end if;
end $$;

insert into auth.users (id, email, aud, role)
values (current_setting('test.att_user')::uuid, 'attendance-fixture@auth.8sots.com.tw', 'authenticated', 'authenticated');
insert into public.tenant_memberships (tenant_id, user_id, status)
values (current_setting('test.att_tenant')::uuid, current_setting('test.att_user')::uuid, 'active');
insert into public.employees (id, tenant_id, auth_user_id, employee_no, full_name, hire_date)
values (current_setting('test.att_employee')::uuid, current_setting('test.att_tenant')::uuid,
  current_setting('test.att_user')::uuid, 'ATT-FIXTURE', 'Attendance Fixture', current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.att_admin'), true);
select set_config('test.att_schedule', public.create_schedule_draft(
  current_setting('test.att_tenant')::uuid, current_date, current_date
)::text, true);
select public.assign_schedule_shift(
  current_setting('test.att_tenant')::uuid, current_setting('test.att_schedule')::uuid,
  current_setting('test.att_employee')::uuid, current_date,
  (select id from public.shifts where tenant_id = current_setting('test.att_tenant')::uuid
    and code = 'WEEKDAY_SPLIT'), 'attendance fixture'
);
select public.publish_schedule(current_setting('test.att_tenant')::uuid, current_setting('test.att_schedule')::uuid);
reset role;

insert into public.punch_records (
  tenant_id, employee_id, work_date, event_type, occurred_at, client_occurred_at,
  timezone, source, latitude, longitude, accuracy_m, location_consent_at,
  idempotency_key, created_by
) values
  (current_setting('test.att_tenant')::uuid, current_setting('test.att_employee')::uuid, current_date,
   'clock_in', (current_date::timestamp + time '10:05') at time zone 'Asia/Taipei', now(),
   'Asia/Taipei', 'web_gps', 25, 121, 20, now(), gen_random_uuid(), current_setting('test.att_user')::uuid),
  (current_setting('test.att_tenant')::uuid, current_setting('test.att_employee')::uuid, current_date,
   'clock_out', (current_date::timestamp + time '13:55') at time zone 'Asia/Taipei', now(),
   'Asia/Taipei', 'web_gps', 25, 121, 20, now(), gen_random_uuid(), current_setting('test.att_user')::uuid),
  (current_setting('test.att_tenant')::uuid, current_setting('test.att_employee')::uuid, current_date,
   'clock_in', (current_date::timestamp + time '16:00') at time zone 'Asia/Taipei', now(),
   'Asia/Taipei', 'web_gps', 25, 121, 20, now(), gen_random_uuid(), current_setting('test.att_user')::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.att_admin'), true);
select set_config('test.att_run_one', public.calculate_attendance(
  current_setting('test.att_tenant')::uuid, current_date, current_date
)::text, true);

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.attendance_exceptions ae
  join public.attendance_days ad on ad.id = ae.attendance_day_id
  where ad.calculation_run_id = current_setting('test.att_run_one')::uuid
    and ad.employee_id = current_setting('test.att_employee')::uuid
    and ae.exception_type = 'missing_clock_out';
  if v_count <> 1 then raise exception 'missing clock out was not detected'; end if;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.att_user'), true);
select set_config('test.att_correction', public.request_punch_correction(
  current_setting('test.att_tenant')::uuid, current_date, 'clock_out',
  (current_date::timestamp + time '21:00') at time zone 'Asia/Taipei',
  'Asia/Taipei', '裝置沒有網路，當下無法完成下班打卡', gen_random_uuid()
)::text, true);

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.punch_correction_requests
  where id = current_setting('test.att_correction')::uuid;
  if v_count <> 1 then raise exception 'employee correction request was not visible to self'; end if;
  begin
    insert into public.attendance_days (tenant_id, calculation_run_id, employee_id, work_date, status)
    values (current_setting('test.att_tenant')::uuid, current_setting('test.att_run_one')::uuid,
      current_setting('test.att_employee')::uuid, current_date + 1, 'complete');
    raise exception 'direct attendance write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', current_setting('test.att_admin'), true);
select public.decide_punch_correction(
  current_setting('test.att_tenant')::uuid, current_setting('test.att_correction')::uuid,
  'approved', 'rollback-only approval'
);
select set_config('test.att_run_two', public.calculate_attendance(
  current_setting('test.att_tenant')::uuid, current_date, current_date
)::text, true);

do $$ declare v_count integer; v_actual integer; v_exceptions integer;
begin
  select actual_minutes, exception_count into v_actual, v_exceptions
  from public.attendance_days where calculation_run_id = current_setting('test.att_run_two')::uuid
    and employee_id = current_setting('test.att_employee')::uuid;
  if v_actual <> 530 then raise exception 'approved correction was not included in recalculation'; end if;
  if v_exceptions <> 2 then raise exception 'late and early-leave exceptions mismatch'; end if;
  select count(*) into v_count from public.attendance_calculation_runs
  where id in (current_setting('test.att_run_one')::uuid, current_setting('test.att_run_two')::uuid);
  if v_count <> 2 then raise exception 'attendance calculation history was overwritten'; end if;
end $$;

reset role;
select true as missing_punch_detected, true as correction_approved,
  true as recalculation_versioned, true as direct_write_blocked;
rollback;
