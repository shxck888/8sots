begin;

-- Sea Star policy: one overtime request may span midnight, but its total
-- duration cannot exceed eight hours (480 minutes). Keep this rule inside the
-- permission-checked RPC so non-UI callers cannot bypass it.
do $migration$
declare
  v_definition text;
  v_anchor text := $old$v_requested_minutes := floor(extract(epoch from (v_ends_at - v_starts_at)) / 60)::integer;$old$;
  v_replacement text := $new$v_requested_minutes := floor(extract(epoch from (v_ends_at - v_starts_at)) / 60)::integer;
  if p_request_type = 'overtime' and v_requested_minutes > 480 then
    raise exception 'overtime duration must not exceed 480 minutes' using errcode = '22023';
  end if;$new$;
begin
  select pg_get_functiondef(
    'public.create_work_request(uuid,public.work_request_type,uuid,timestamp without time zone,timestamp without time zone,text,uuid)'::regprocedure
  ) into v_definition;
  if length(v_definition) = length(replace(v_definition, v_anchor, v_replacement)) then
    raise exception 'create_work_request duration insertion point not found';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$migration$;

commit;
