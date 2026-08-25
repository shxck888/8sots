-- Request Center V2 rollback-only integration test. Requires migration 017.
begin;

select set_config('test.request_v2_user', tm.user_id::text, true),
  set_config('test.request_v2_tenant', tm.tenant_id::text, true),
  set_config('test.request_v2_employee', e.id::text, true)
from public.tenant_memberships tm
join public.employees e on e.tenant_id = tm.tenant_id and e.auth_user_id = tm.user_id and e.status = 'active'
join public.membership_roles mr on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
join public.roles r on r.tenant_id = mr.tenant_id and r.id = mr.role_id
join public.role_permissions rp on rp.tenant_id = r.tenant_id and rp.role_id = r.id
join public.permissions p on p.id = rp.permission_id and p.code = 'request.manage'
where tm.status = 'active'
order by tm.created_at limit 1;

do $$ begin
  if current_setting('test.request_v2_user', true) is null then
    raise exception 'request center V2 administrator fixture not found';
  end if;
end $$;

select set_config('test.request_v2_leave_type', id::text, true)
from public.leave_types where tenant_id = current_setting('test.request_v2_tenant')::uuid
  and is_active order by code limit 1;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.request_v2_user'), true);

select set_config('test.request_v2_pending', public.create_work_request(
  current_setting('test.request_v2_tenant')::uuid, 'leave',
  current_setting('test.request_v2_leave_type')::uuid,
  ((current_date + 2)::text || ' 10:00')::timestamp,
  ((current_date + 2)::text || ' 12:00')::timestamp,
  'Request V2 withdrawal rollback test', gen_random_uuid()
)::text, true);

select public.withdraw_work_request(
  current_setting('test.request_v2_tenant')::uuid,
  current_setting('test.request_v2_pending')::uuid
);

do $$ declare v_count integer;
begin
  select count(*) into v_count from public.work_request_withdrawals
  where work_request_id = current_setting('test.request_v2_pending')::uuid;
  if v_count <> 1 then raise exception 'pending withdrawal failed'; end if;

  begin
    perform public.decide_work_request(
      current_setting('test.request_v2_tenant')::uuid,
      current_setting('test.request_v2_pending')::uuid, 'approved', null
    );
    raise exception 'withdrawn request unexpectedly decided';
  exception when object_not_in_prerequisite_state then null;
  end;
end $$;

select public.upsert_leave_entitlement(
  current_setting('test.request_v2_tenant')::uuid,
  current_setting('test.request_v2_employee')::uuid,
  current_setting('test.request_v2_leave_type')::uuid,
  extract(year from current_date)::integer, 4800, 'Rollback test'
);

do $$ declare v_minutes integer;
begin
  select entitled_minutes into v_minutes from public.leave_entitlements
  where tenant_id = current_setting('test.request_v2_tenant')::uuid
    and employee_id = current_setting('test.request_v2_employee')::uuid
    and leave_type_id = current_setting('test.request_v2_leave_type')::uuid
    and entitlement_year = extract(year from current_date)::integer;
  if v_minutes <> 4800 then raise exception 'leave entitlement upsert failed'; end if;
end $$;

reset role;
select true as pending_withdrawal_valid,
  true as withdrawn_decision_blocked,
  true as leave_entitlement_upsert_valid;
rollback;
