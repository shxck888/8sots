-- Schedule foundation integration test.
-- Run as a Supabase project owner in SQL Editor after migration 202608250010.
-- A successful run returns one row with all booleans true, then ROLLBACK.

begin;

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
where t.slug = '8sots' and p.code = 'schedule.manage'
limit 1;

do $$
begin
  if current_setting('test.tenant_a', true) is null
     or current_setting('test.user_a', true) is null then
    raise exception 'production tenant/schedule administrator fixture not found';
  end if;
end;
$$;

insert into public.tenants (name, slug, timezone)
values ('Schedule Isolation Fixture', 'schedule-isolation-fixture', 'Asia/Taipei')
returning set_config('test.tenant_b', id::text, true);

insert into public.employees (tenant_id, employee_no, full_name, hire_date, status, notes)
values (
  current_setting('test.tenant_a')::uuid,
  'SCHEDTMP', 'Schedule Test Employee', current_date, 'active', 'rollback-only fixture'
)
returning set_config('test.employee_a', id::text, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);

select set_config(
  'test.weekday_shift',
  public.upsert_shift_template(
    current_setting('test.tenant_a')::uuid,
    'TEST_WEEKDAY_SPLIT', '測試平日班',
    '[{"start_minute":600,"end_minute":840},{"start_minute":960,"end_minute":1260}]'::jsonb
  )::text,
  true
);

select set_config(
  'test.holiday_shift',
  public.upsert_shift_template(
    current_setting('test.tenant_a')::uuid,
    'TEST_HOLIDAY_CONTINUOUS', '測試假日班',
    '[{"start_minute":600,"end_minute":1260}]'::jsonb
  )::text,
  true
);

select set_config(
  'test.overnight_shift',
  public.upsert_shift_template(
    current_setting('test.tenant_a')::uuid,
    'TEST_OVERNIGHT', '測試跨日班',
    '[{"start_minute":1320,"end_minute":1560}]'::jsonb
  )::text,
  true
);

do $$
declare
  v_minutes integer;
begin
  select sum(end_minute - start_minute) into v_minutes
  from public.shift_segments
  where shift_id = current_setting('test.weekday_shift')::uuid;
  if v_minutes <> 540 then raise exception 'weekday shift minutes mismatch'; end if;

  select sum(end_minute - start_minute) into v_minutes
  from public.shift_segments
  where shift_id = current_setting('test.holiday_shift')::uuid;
  if v_minutes <> 660 then raise exception 'holiday shift minutes mismatch'; end if;

  select sum(end_minute - start_minute) into v_minutes
  from public.shift_segments
  where shift_id = current_setting('test.overnight_shift')::uuid;
  if v_minutes <> 240 then raise exception 'cross-midnight shift minutes mismatch'; end if;

  begin
    perform public.upsert_shift_template(
      current_setting('test.tenant_a')::uuid,
      'TEST_OVERLAP', '重疊班段必須失敗',
      '[{"start_minute":600,"end_minute":900},{"start_minute":840,"end_minute":1020}]'::jsonb
    );
    raise exception 'overlapping shift segments unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.upsert_shift_template(
      current_setting('test.tenant_b')::uuid,
      'TEST_CROSS_TENANT', '跨租戶必須失敗',
      '[{"start_minute":600,"end_minute":840}]'::jsonb
    );
    raise exception 'cross-tenant schedule RPC unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config(
  'test.schedule_version',
  public.create_schedule_draft(
    current_setting('test.tenant_a')::uuid,
    current_date,
    current_date + 6
  )::text,
  true
);

select public.assign_schedule_shift(
  current_setting('test.tenant_a')::uuid,
  current_setting('test.schedule_version')::uuid,
  current_setting('test.employee_a')::uuid,
  current_date,
  current_setting('test.weekday_shift')::uuid,
  'rollback-only fixture'
);

select public.publish_schedule(
  current_setting('test.tenant_a')::uuid,
  current_setting('test.schedule_version')::uuid
);

do $$
begin
  if not exists (
    select 1 from public.schedule_versions
    where id = current_setting('test.schedule_version')::uuid and status = 'published'
  ) then raise exception 'schedule publish failed'; end if;

  begin
    perform public.assign_schedule_shift(
      current_setting('test.tenant_a')::uuid,
      current_setting('test.schedule_version')::uuid,
      current_setting('test.employee_a')::uuid,
      current_date,
      current_setting('test.holiday_shift')::uuid,
      null
    );
    raise exception 'published schedule mutation unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    perform public.upsert_shift_template(
      current_setting('test.tenant_a')::uuid,
      'TEST_WEEKDAY_SPLIT', '已發布班別不可覆寫',
      '[{"start_minute":600,"end_minute":1260}]'::jsonb
    );
    raise exception 'published shift mutation unexpectedly succeeded';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select set_config(
  'test.schedule_version_2',
  public.create_schedule_draft(
    current_setting('test.tenant_a')::uuid,
    current_date,
    current_date + 6
  )::text,
  true
);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.schedule_assignments
  where schedule_version_id = current_setting('test.schedule_version_2')::uuid
    and employee_id = current_setting('test.employee_a')::uuid
    and work_date = current_date
    and shift_id = current_setting('test.weekday_shift')::uuid;
  if v_count <> 1 then raise exception 'published schedule clone failed'; end if;

  perform public.save_schedule_assignments(
    current_setting('test.tenant_a')::uuid,
    current_setting('test.schedule_version_2')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'employee_id', current_setting('test.employee_a')::uuid,
        'work_date', current_date,
        'shift_id', current_setting('test.holiday_shift')::uuid
      ),
      jsonb_build_object(
        'employee_id', current_setting('test.employee_a')::uuid,
        'work_date', current_date + 1,
        'shift_id', null
      )
    )
  );

  select count(*) into v_count
  from public.schedule_assignments
  where schedule_version_id = current_setting('test.schedule_version_2')::uuid
    and employee_id = current_setting('test.employee_a')::uuid
    and work_date = current_date
    and shift_id = current_setting('test.holiday_shift')::uuid;
  if v_count <> 1 then raise exception 'batch schedule assignment save failed'; end if;
end;
$$;

reset role;

select
  true as weekday_split_minutes_valid,
  true as holiday_continuous_minutes_valid,
  true as cross_midnight_valid,
  true as overlap_rejected,
  true as cross_tenant_rpc_blocked,
  true as schedule_published,
  true as published_schedule_immutable,
  true as published_shift_immutable,
  true as published_schedule_cloned,
  true as batch_assignment_saved;

rollback;
