begin;

-- Sea Star leave policy: every covered local date must be Tuesday through
-- Friday, and national/company holidays are not leave-request dates.
do $migration$
declare
  v_definition text;
  v_anchor text := $old$if v_requested_minutes not between 1 and 44640 then$old$;
  v_replacement text := $new$if p_request_type = 'leave' then
    if exists (
      select 1 from generate_series(
        p_starts_local::date,
        (p_ends_local - interval '1 microsecond')::date,
        interval '1 day'
      ) covered(day)
      where extract(isodow from covered.day) not between 2 and 5
    ) then
      raise exception 'leave dates must be Tuesday through Friday' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.holiday_calendar_entries holiday
      where holiday.tenant_id = p_tenant_id
        and holiday.holiday_date between p_starts_local::date
          and (p_ends_local - interval '1 microsecond')::date
        and holiday.kind in ('national', 'company')
    ) then
      raise exception 'leave is not allowed on holidays' using errcode = '22023';
    end if;
  end if;
  if v_requested_minutes not between 1 and 44640 then$new$;
begin
  select pg_get_functiondef(
    'public.create_work_request(uuid,public.work_request_type,uuid,timestamp without time zone,timestamp without time zone,text,uuid)'::regprocedure
  ) into v_definition;
  if length(v_definition) = length(replace(v_definition, v_anchor, v_replacement)) then
    raise exception 'create_work_request leave-policy insertion point not found';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$migration$;

commit;
