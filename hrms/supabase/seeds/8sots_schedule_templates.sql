-- Environment seed for the production tenant with slug `8sots`.
-- Run after migration 202608250010. It is idempotent until a template is used
-- by a published schedule; published schedule history intentionally locks it.

begin;

do $$
declare
  v_tenant_id uuid;
  v_shift_id uuid;
begin
  select id into v_tenant_id from public.tenants where slug = '8sots';
  if v_tenant_id is null then
    raise exception 'tenant 8sots not found';
  end if;

  insert into public.shifts (tenant_id, code, name, status)
  values (v_tenant_id, 'WEEKDAY_SPLIT', '平日班', 'active')
  on conflict (tenant_id, code) do update set
    name = excluded.name, status = excluded.status, updated_at = now()
  returning id into v_shift_id;
  delete from public.shift_segments where tenant_id = v_tenant_id and shift_id = v_shift_id;
  insert into public.shift_segments (tenant_id, shift_id, segment_order, start_minute, end_minute)
  values
    (v_tenant_id, v_shift_id, 1, 600, 840),
    (v_tenant_id, v_shift_id, 2, 960, 1260);

  insert into public.audit_logs (tenant_id, action, entity_type, entity_id, after_data)
  values (
    v_tenant_id, 'shift.seeded', 'shift', v_shift_id::text,
    jsonb_build_object(
      'code', 'WEEKDAY_SPLIT', 'name', '平日班', 'total_minutes', 540,
      'segments', jsonb_build_array(
        jsonb_build_object('start_minute', 600, 'end_minute', 840),
        jsonb_build_object('start_minute', 960, 'end_minute', 1260)
      )
    )
  );

  insert into public.shifts (tenant_id, code, name, status)
  values (v_tenant_id, 'HOLIDAY_CONTINUOUS', '假日班', 'active')
  on conflict (tenant_id, code) do update set
    name = excluded.name, status = excluded.status, updated_at = now()
  returning id into v_shift_id;
  delete from public.shift_segments where tenant_id = v_tenant_id and shift_id = v_shift_id;
  insert into public.shift_segments (tenant_id, shift_id, segment_order, start_minute, end_minute)
  values (v_tenant_id, v_shift_id, 1, 600, 1260);

  insert into public.audit_logs (tenant_id, action, entity_type, entity_id, after_data)
  values (
    v_tenant_id, 'shift.seeded', 'shift', v_shift_id::text,
    jsonb_build_object(
      'code', 'HOLIDAY_CONTINUOUS', 'name', '假日班', 'total_minutes', 660,
      'segments', jsonb_build_array(
        jsonb_build_object('start_minute', 600, 'end_minute', 1260)
      )
    )
  );
end;
$$;

commit;
