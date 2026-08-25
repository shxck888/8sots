-- Navigation aggregate RPC integration test. Uses existing production identities and rolls back.
begin;

select set_config('test.nav_user', tm.user_id::text, true)
from public.tenant_memberships tm
join public.tenants t on t.id = tm.tenant_id
where t.slug = '8sots' and tm.status = 'active'
order by tm.created_at
limit 1;

do $$ begin
  if current_setting('test.nav_user', true) is null then
    raise exception 'production navigation fixture not found';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.nav_user'), true);

do $$ declare v_count integer; v_overview jsonb;
begin
  select count(*) into v_count from public.get_current_workspace_context();
  if v_count <> 1 then raise exception 'workspace bootstrap did not return exactly one row'; end if;

  perform * from public.get_my_published_schedule(current_date - 7, current_date + 31);
  select public.get_my_attendance_overview(10, 10, 10) into v_overview;
  if not (v_overview ? 'punches' and v_overview ? 'days' and v_overview ? 'requests') then
    raise exception 'attendance overview shape mismatch';
  end if;
end $$;

reset role;
set local role anon;
do $$ begin
  perform * from public.get_current_workspace_context();
  raise exception 'anonymous workspace bootstrap unexpectedly succeeded';
exception when insufficient_privilege then null;
end $$;

reset role;
select true as workspace_bootstrap_valid,
  true as schedule_aggregate_valid,
  true as attendance_aggregate_valid,
  true as anonymous_execute_blocked;
rollback;
