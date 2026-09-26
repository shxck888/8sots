begin;

-- Allow the store-closure option on Monday through Friday.
do $$
declare
  v_sql text;
  v_old text := 'or extract(isodow from work_date) <> 1';
begin
  select pg_get_functiondef('public.save_schedule_assignments(uuid,uuid,jsonb)'::regprocedure)
    into v_sql;
  if position(v_old in v_sql) = 0 then
    raise exception 'weekday store closure migration anchor missing';
  end if;
  v_sql := replace(v_sql, v_old, 'or extract(isodow from work_date) > 5');
  v_sql := replace(v_sql,
    'store closure must be a Monday without a shift or day off',
    'store closure must be a weekday without a shift or day off');
  execute v_sql;
end;
$$;

commit;
