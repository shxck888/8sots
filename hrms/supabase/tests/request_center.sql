-- Request center integration test. Uses an existing administrator identity and rolls back.
begin;

select set_config('test.request_user', tm.user_id::text, true),
  set_config('test.request_tenant', tm.tenant_id::text, true),
  set_config('test.request_employee', e.id::text, true)
from public.tenant_memberships tm
join public.employees e on e.tenant_id = tm.tenant_id and e.auth_user_id = tm.user_id and e.status = 'active'
join public.membership_roles mr on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
join public.roles r on r.tenant_id = mr.tenant_id and r.id = mr.role_id
join public.role_permissions rp on rp.tenant_id = r.tenant_id and rp.role_id = r.id
join public.permissions p on p.id = rp.permission_id
where tm.status = 'active'
  and p.code in ('request.manage', 'platform.admin')
order by tm.created_at
limit 1;

do $$ begin
  if current_setting('test.request_user', true) is null then
    raise exception 'request center administrator fixture not found';
  end if;
end $$;

select set_config('test.leave_type', lt.id::text, true)
from public.leave_types lt
where lt.tenant_id = current_setting('test.request_tenant')::uuid and lt.is_active
order by lt.code limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.request_user'), true);

select set_config('test.request_id', public.create_work_request(
  current_setting('test.request_tenant')::uuid,
  'leave',
  current_setting('test.leave_type')::uuid,
  ((current_date + 1)::text || ' 10:00')::timestamp,
  ((current_date + 1)::text || ' 14:00')::timestamp,
  'Request center rollback integration test',
  gen_random_uuid()
)::text, true);

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.work_requests
  where id = current_setting('test.request_id')::uuid
    and employee_id = current_setting('test.request_employee')::uuid
    and requested_minutes = 240;
  if v_count <> 1 then raise exception 'employee request create/read failed'; end if;

  perform public.decide_work_request(
    current_setting('test.request_tenant')::uuid,
    current_setting('test.request_id')::uuid,
    'approved',
    'Integration test approval'
  );
  select count(*) into v_count from public.work_request_decisions
  where work_request_id = current_setting('test.request_id')::uuid and decision = 'approved';
  if v_count <> 1 then raise exception 'request decision failed'; end if;

  begin
    perform public.decide_work_request(
      current_setting('test.request_tenant')::uuid,
      current_setting('test.request_id')::uuid,
      'rejected',
      null
    );
    raise exception 'second final decision unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

reset role;
set local role anon;
do $$ begin
  perform public.create_work_request(null, null, null, null, null, null, null);
  raise exception 'anonymous request RPC unexpectedly succeeded';
exception when insufficient_privilege then null;
end $$;

reset role;
select true as employee_request_valid,
  true as manager_decision_valid,
  true as immutable_final_decision_valid,
  true as anonymous_execute_blocked;
rollback;
