begin;

-- The existing alternating clock-in/out events represent the two work
-- segments of a lunch shift. Reject a fifth event (or a third event on a
-- continuous shift) without changing immutable historical punch records.
do $migration$
declare
  v_definition text;
  v_anchor text := $anchor$v_event_type := coalesce(v_event_type, 'clock_in'::public.punch_event_type);$anchor$;
  v_guard text := $guard$
  v_event_type := coalesce(v_event_type, 'clock_in'::public.punch_event_type);

  if exists (
    select 1
    from public.schedule_assignments sa
    join public.schedule_versions sv on sv.tenant_id = sa.tenant_id
      and sv.id = sa.schedule_version_id and sv.status = 'published'
    join public.shift_segments ss on ss.tenant_id = sa.tenant_id and ss.shift_id = sa.shift_id
    where sa.tenant_id = p_tenant_id and sa.employee_id = v_employee_id
      and sa.work_date = v_work_date
    group by sa.id
    having count(ss.id) * 2 <= (
      select count(*) from public.punch_records pr
      where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
        and pr.work_date = v_work_date
    )
  ) then
    raise exception 'scheduled punch sequence complete' using errcode = '55000';
  end if;
  $guard$;
begin
  select pg_get_functiondef(
    'public.record_gps_punch(uuid,uuid,timestamptz,text,numeric,numeric,numeric,boolean)'::regprocedure
  ) into v_definition;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'record_gps_punch insertion point not found';
  end if;
  execute replace(v_definition, v_anchor, v_guard);
end;
$migration$;

commit;
