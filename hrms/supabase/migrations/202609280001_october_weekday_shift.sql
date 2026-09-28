begin;
create function public.weekday_shift_code_for_date(p_work_date date) returns text
language sql immutable set search_path='' as $$
  select case when p_work_date>=date '2026-10-01' then 'WEEKDAY_SPLIT_OCT2026' else 'WEEKDAY_SPLIT' end;
$$;
create function public.is_lunch_shift_code(p_code text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(p_code in ('WEEKDAY_SPLIT','WEEKDAY_SPLIT_OCT2026'),false);
$$;
revoke all on function public.weekday_shift_code_for_date(date),public.is_lunch_shift_code(text) from public,anon,authenticated;
grant execute on function public.weekday_shift_code_for_date(date),public.is_lunch_shift_code(text) to authenticated;

-- Add an immutable replacement template; keep the original and every locked
-- assignment intact for reproducible historical attendance/payroll.
do $$ declare v_old record; v_new uuid; begin
  for v_old in select * from public.shifts where code='WEEKDAY_SPLIT' and status='active' loop
    insert into public.shifts(tenant_id,code,name,created_by)
    values(v_old.tenant_id,'WEEKDAY_SPLIT_OCT2026',v_old.name,v_old.created_by) returning id into v_new;
    insert into public.shift_segments(tenant_id,shift_id,segment_order,start_minute,end_minute) values
      (v_old.tenant_id,v_new,1,600,870),(v_old.tenant_id,v_new,2,990,1260);
    insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
    values(v_old.tenant_id,null,'shift.october_hours_created','shift',v_new::text,
      jsonb_build_object('effective_from','2026-10-01','replaces_shift_id',v_old.id,'morning','10:00–14:30','lunch','14:30–16:30','meal','16:30–17:00','afternoon_work','17:00–21:00'));
  end loop;
end $$;

-- Default generation and save validation choose the template per work date,
-- including a week straddling September/October and optional Monday opening.
do $$ declare v_sql text; v_anchor text; begin
  select pg_get_functiondef('public.create_schedule_draft(uuid,date,date)'::regprocedure) into v_sql;
  if position('else ''WEEKDAY_SPLIT''' in v_sql)=0 then raise exception 'draft weekday anchor missing'; end if;
  v_sql:=replace(v_sql,'then ''WEEKDAY_SPLIT''','then public.weekday_shift_code_for_date(day.work_date::date)');
  v_sql:=replace(v_sql,'else ''WEEKDAY_SPLIT''','else public.weekday_shift_code_for_date(day.work_date::date)');
  v_anchor:='  insert into public.audit_logs (';
  if position(v_anchor in v_sql)=0 then raise exception 'draft normalization anchor missing'; end if;
  v_sql:=replace(v_sql,v_anchor,'  update public.schedule_assignments sa set shift_id=new_shift.id
    from public.shifts old_shift,public.shifts new_shift
    where sa.tenant_id=p_tenant_id and sa.schedule_version_id=v_schedule_version_id
      and sa.shift_id=old_shift.id and old_shift.tenant_id=sa.tenant_id
      and old_shift.code=''WEEKDAY_SPLIT'' and sa.work_date>=date ''2026-10-01''
      and new_shift.tenant_id=sa.tenant_id and new_shift.code=''WEEKDAY_SPLIT_OCT2026'';
'||v_anchor);
  v_anchor:='  perform pg_advisory_xact_lock(';
  if position(v_anchor in v_sql)=0 then raise exception 'draft template guard anchor missing'; end if;
  v_sql:=replace(v_sql,v_anchor,'  if p_period_end>=date ''2026-10-01'' and not exists(select 1 from public.shifts
    where tenant_id=p_tenant_id and code=''WEEKDAY_SPLIT_OCT2026'' and status=''active'') then
    raise exception ''default active shifts not found'' using errcode=''P0002'';
  end if;
'||v_anchor);
  execute v_sql;
  select pg_get_functiondef('public.save_schedule_assignments(uuid,uuid,jsonb)'::regprocedure) into v_sql;
  if position('else ''WEEKDAY_SPLIT''' in v_sql)=0 then raise exception 'save weekday anchor missing'; end if;
  v_sql:=replace(v_sql,'then ''WEEKDAY_SPLIT''','then public.weekday_shift_code_for_date(item.work_date)');
  v_sql:=replace(v_sql,'else ''WEEKDAY_SPLIT''','else public.weekday_shift_code_for_date(item.work_date)');
  execute v_sql;
  select pg_get_functiondef('public.stamp_afternoon_meal()'::regprocedure) into v_sql;
  v_anchor:='v_code is distinct from ''WEEKDAY_SPLIT''';
  if position(v_anchor in v_sql)=0 then raise exception 'automatic meal shift anchor missing'; end if;
  execute replace(v_sql,v_anchor,'not public.is_lunch_shift_code(v_code)');
end $$;

-- Existing October assignments are drafts in production. Stop rather than
-- silently modifying an already published future schedule if that changes.
do $$ begin
  if exists(select 1 from public.schedule_assignments sa
    join public.schedule_versions sv on sv.id=sa.schedule_version_id
    join public.shifts s on s.id=sa.shift_id
    where sa.work_date>=date '2026-10-01' and sv.status='published' and s.code='WEEKDAY_SPLIT') then
    raise exception 'published October weekday assignments require a new schedule version';
  end if;
end $$;
update public.schedule_assignments sa set shift_id=new_shift.id,updated_at=statement_timestamp()
from public.schedule_versions sv,public.shifts old_shift,public.shifts new_shift
where sv.id=sa.schedule_version_id and sv.status='draft'
  and old_shift.id=sa.shift_id and old_shift.tenant_id=sa.tenant_id and old_shift.code='WEEKDAY_SPLIT'
  and new_shift.tenant_id=sa.tenant_id and new_shift.code='WEEKDAY_SPLIT_OCT2026'
  and sa.work_date>=date '2026-10-01';
commit;
