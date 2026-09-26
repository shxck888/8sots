begin;
-- Actual work includes out-of-schedule time. Keep scheduled regular work
-- separately so approved overtime is not also paid in the hourly base.
alter table public.attendance_days add column payroll_regular_minutes integer not null default 0 check(payroll_regular_minutes>=0);
update public.attendance_days set payroll_regular_minutes=actual_minutes;
do $migration$
declare v_sql text; v_anchor text;
begin
  select pg_get_functiondef('public.calculate_attendance_v1(uuid,date,date)'::regprocedure) into v_sql;
  v_sql:=replace(v_sql,'v_total_actual integer;', 'v_total_actual integer; v_total_regular integer; v_regular integer;');
  v_sql:=replace(v_sql,'v_total_actual:=0;', 'v_total_actual:=0; v_total_regular:=0;');
  v_anchor:='      if v_in_at is not null and v_out_at is not null then';
  if position(v_anchor in v_sql)=0 then raise exception 'regular minute anchor missing'; end if;
  v_sql:=replace(v_sql,v_anchor,$body$      v_regular:=case when v_in_at is not null and v_out_at is not null and v_out_at>=v_in_at then
        greatest(0,floor(extract(epoch from(least(v_out_at,v_scheduled_end)-greatest(v_in_at,v_scheduled_start)))/60)::integer) else 0 end;
      if v_in_at is not null and v_out_at is not null then
        v_regular:=greatest(0,v_regular-coalesce((select floor(sum(greatest(0,extract(epoch from
          (least(b.ends_at,v_out_at,v_scheduled_end)-greatest(b.starts_at,v_in_at,v_scheduled_start)))))/60)::integer
          from public.meal_break_intervals(p_tenant_id,v_item.employee_id,v_item.work_date) b),0));
      end if;
      v_total_regular:=v_total_regular+v_regular;
      if v_in_at is not null and v_out_at is not null then$body$);
  v_sql:=replace(v_sql,'set actual_minutes=v_total_actual,','set actual_minutes=v_total_actual,payroll_regular_minutes=v_total_regular,');
  execute v_sql;

  select pg_get_functiondef('public.calculate_payroll_draft(uuid,uuid)'::regprocedure) into v_sql;
  v_anchor:='''actual_minutes'', coalesce(sum(d.actual_minutes), 0),';
  if position(v_anchor in v_sql)=0 then raise exception 'payroll snapshot anchor missing'; end if;
  v_sql:=replace(v_sql,v_anchor,'''actual_minutes'', coalesce(sum(d.actual_minutes), 0), ''payroll_regular_minutes'', coalesce(sum(d.payroll_regular_minutes),0),');
  v_sql:=replace(v_sql,'(v_attendance->>''actual_minutes'')::integer, 1000000)', '(v_attendance->>''payroll_regular_minutes'')::integer, 1000000)');
  execute v_sql;
end;
$migration$;
commit;
