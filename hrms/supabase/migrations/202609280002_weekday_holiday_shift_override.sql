begin;

-- Managers may select the continuous holiday shift on any weekday for a
-- long weekend or compensatory holiday, without a holiday-calendar entry.
-- Keep date-specific weekday templates and company shutdown validation.
do $$
declare
  v_sql text;
  v_anchor text := 'extract(isodow from item.work_date) = 1
          and h.kind = ''national'' and s.code = ''HOLIDAY_CONTINUOUS''';
begin
  select pg_get_functiondef('public.save_schedule_assignments(uuid,uuid,jsonb)'::regprocedure) into v_sql;
  if position(v_anchor in v_sql) = 0 then
    raise exception 'weekday holiday shift validation anchor missing';
  end if;
  execute replace(v_sql, v_anchor, 'extract(isodow from item.work_date) between 1 and 5
          and s.code = ''HOLIDAY_CONTINUOUS''');
end $$;

commit;
