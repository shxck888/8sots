begin;

-- A leave request represents one date and one time interval. Employees submit
-- separate requests for separate dates; overtime retains its cross-day support.
do $migration$
declare
  v_definition text;
  v_anchor text := $old$if p_request_type = 'leave' then[[:space:]]+if exists \($old$;
  v_replacement text := $new$if p_request_type = 'leave'
     and p_starts_local::date <> (p_ends_local - interval '1 microsecond')::date then
    raise exception 'leave request must cover one local date' using errcode = '22023';
  end if;
  if p_request_type = 'leave' then if exists ($new$;
begin
  select pg_get_functiondef(
    'public.create_work_request(uuid,public.work_request_type,uuid,timestamp without time zone,timestamp without time zone,text,uuid)'::regprocedure
  ) into v_definition;
  if v_definition = regexp_replace(v_definition, v_anchor, v_replacement) then
    raise exception 'create_work_request single-date insertion point not found';
  end if;
  execute regexp_replace(v_definition, v_anchor, v_replacement);
end;
$migration$;

commit;
