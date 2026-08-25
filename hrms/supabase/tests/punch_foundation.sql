-- GPS punch integration test. Run as project owner in SQL Editor.
-- Every Auth, Employee, Membership and Punch fixture is rolled back.

begin;

select set_config('test.punch_tenant', id::text, true)
from public.tenants where slug = '8sots' limit 1;
select set_config('test.punch_user', gen_random_uuid()::text, true);
select set_config('test.punch_employee', gen_random_uuid()::text, true);
select set_config('test.punch_key_one', gen_random_uuid()::text, true);
select set_config('test.punch_key_two', gen_random_uuid()::text, true);

do $$ begin
  if current_setting('test.punch_tenant', true) is null then
    raise exception 'production tenant fixture not found';
  end if;
end $$;

insert into auth.users (id, email, aud, role)
values (current_setting('test.punch_user')::uuid, 'punch-fixture@auth.8sots.com.tw', 'authenticated', 'authenticated');

insert into public.tenant_memberships (tenant_id, user_id, status)
values (current_setting('test.punch_tenant')::uuid, current_setting('test.punch_user')::uuid, 'active');

insert into public.employees (id, tenant_id, auth_user_id, employee_no, full_name, hire_date)
values (current_setting('test.punch_employee')::uuid, current_setting('test.punch_tenant')::uuid,
  current_setting('test.punch_user')::uuid, 'PUNCH-FIXTURE', 'Punch Fixture', current_date);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.punch_user'), true);

select set_config('test.punch_one', public.record_gps_punch(
  current_setting('test.punch_tenant')::uuid, current_setting('test.punch_key_one')::uuid,
  statement_timestamp(), 'Asia/Taipei', 25.033, 121.5654, 18, true
)::text, true);
select set_config('test.punch_two', public.record_gps_punch(
  current_setting('test.punch_tenant')::uuid, current_setting('test.punch_key_two')::uuid,
  statement_timestamp(), 'Asia/Taipei', 25.033, 121.5654, 18, true
)::text, true);

do $$
declare v_count integer; v_type public.punch_event_type; v_same uuid;
begin
  select event_type into v_type from public.punch_records where id = current_setting('test.punch_one')::uuid;
  if v_type <> 'clock_in' then raise exception 'first punch was not clock_in'; end if;
  select event_type into v_type from public.punch_records where id = current_setting('test.punch_two')::uuid;
  if v_type <> 'clock_out' then raise exception 'second punch was not clock_out'; end if;

  v_same := public.record_gps_punch(
    current_setting('test.punch_tenant')::uuid, current_setting('test.punch_key_two')::uuid,
    statement_timestamp(), 'Asia/Taipei', 25.033, 121.5654, 18, true
  );
  select count(*) into v_count from public.punch_records where employee_id = current_setting('test.punch_employee')::uuid;
  if v_same <> current_setting('test.punch_two')::uuid or v_count <> 2 then
    raise exception 'idempotent punch duplicated';
  end if;

  begin
    insert into public.punch_records (tenant_id, employee_id, work_date, event_type,
      client_occurred_at, timezone, source, latitude, longitude, accuracy_m,
      location_consent_at, idempotency_key, created_by)
    values (current_setting('test.punch_tenant')::uuid, current_setting('test.punch_employee')::uuid,
      current_date, 'clock_in', now(), 'Asia/Taipei', 'web_gps', 25, 121, 20,
      now(), gen_random_uuid(), current_setting('test.punch_user')::uuid);
    raise exception 'direct punch insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$ begin
  begin
    update public.punch_records set accuracy_m = 19 where id = current_setting('test.punch_one')::uuid;
    raise exception 'punch mutation unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

select true as alternating_events, true as idempotency_protected,
  true as direct_insert_blocked, true as immutable_records;

rollback;
