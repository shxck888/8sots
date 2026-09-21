begin;

alter table public.employees
  add column archived_at timestamptz,
  add column archived_by uuid references auth.users(id) on delete set null,
  add column archive_reason text check (archive_reason is null or char_length(trim(archive_reason)) between 5 and 500),
  add check ((archived_at is null and archived_by is null and archive_reason is null)
    or (archived_at is not null and archive_reason is not null));

create index employees_archived_idx on public.employees (tenant_id, archived_at desc)
  where archived_at is not null;

create or replace view public.employee_master_current
with (security_invoker = true)
as
select
  e.id,
  e.tenant_id,
  e.auth_user_id,
  e.employee_no,
  e.full_name,
  ep.english_name,
  ep.national_id_last4,
  ep.birth_date,
  ep.gender,
  ep.address,
  ep.photo_path,
  ec.mobile,
  ec.email,
  ec.emergency_contact_name,
  ec.emergency_contact_phone,
  er.id as employment_record_id,
  er.department_id,
  d.name as department_name,
  er.position_id,
  p.name as position_name,
  er.supervisor_employee_id,
  supervisor.full_name as supervisor_name,
  er.employment_type,
  er.hire_date,
  er.termination_date,
  er.probation_end_date,
  er.status,
  er.effective_from,
  e.notes,
  e.created_at,
  e.updated_at,
  e.archived_at,
  e.archived_by,
  e.archive_reason
from public.employees e
left join public.employee_profiles ep on ep.tenant_id = e.tenant_id and ep.employee_id = e.id
left join public.employee_contacts ec on ec.tenant_id = e.tenant_id and ec.employee_id = e.id
left join public.employment_records er
  on er.tenant_id = e.tenant_id and er.employee_id = e.id and er.effective_to is null
left join public.departments d on d.tenant_id = er.tenant_id and d.id = er.department_id
left join public.positions p on p.tenant_id = er.tenant_id and p.id = er.position_id
left join public.employees supervisor
  on supervisor.tenant_id = er.tenant_id and supervisor.id = er.supervisor_employee_id;

revoke all on table public.employee_master_current from anon, authenticated;
grant select on table public.employee_master_current to authenticated;

create function public.employee_deletion_blockers(p_tenant_id uuid,p_employee_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare v_blockers text[] := array[]::text[]; v_auth_user_id uuid;
begin
  select auth_user_id into v_auth_user_id from public.employees
  where tenant_id=p_tenant_id and id=p_employee_id;
  if exists(select 1 from public.schedule_assignments where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'排班紀錄'); end if;
  if exists(select 1 from public.punch_records where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'打卡紀錄'); end if;
  if exists(select 1 from public.attendance_days where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'出勤計算'); end if;
  if exists(select 1 from public.punch_correction_requests where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'補打卡申請'); end if;
  if exists(select 1 from public.work_requests where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'請假或加班申請'); end if;
  if exists(select 1 from public.leave_entitlements where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'假別額度'); end if;
  if exists(select 1 from public.employee_compensation_versions where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'薪資版本'); end if;
  if exists(select 1 from public.payroll_entries where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'薪資紀錄'); end if;
  if exists(select 1 from public.employee_statutory_profile_versions where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'投保或扣繳版本'); end if;
  if exists(select 1 from public.annual_leave_grants where tenant_id=p_tenant_id and employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'特休台帳'); end if;
  if exists(select 1 from public.employment_records where tenant_id=p_tenant_id and supervisor_employee_id=p_employee_id) then v_blockers:=array_append(v_blockers,'仍為其他員工主管'); end if;
  if v_auth_user_id is not null and exists(
    select 1 from public.tenant_memberships tm join public.membership_roles mr
      on mr.tenant_id=tm.tenant_id and mr.membership_id=tm.id
    where tm.tenant_id=p_tenant_id and tm.user_id=v_auth_user_id
  ) then v_blockers:=array_append(v_blockers,'管理角色'); end if;
  return v_blockers;
end $$;

create function public.get_employee_deletion_eligibility(p_tenant_id uuid,p_employee_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_employee public.employees%rowtype; v_blockers text[];
begin
  if not public.current_user_has_permission(p_tenant_id,'employee.manage') then
    raise exception 'employee.manage permission required' using errcode='42501';
  end if;
  select * into v_employee from public.employees where tenant_id=p_tenant_id and id=p_employee_id;
  if v_employee.id is null then raise exception 'employee not found' using errcode='P0002'; end if;
  v_blockers:=public.employee_deletion_blockers(p_tenant_id,p_employee_id);
  return jsonb_build_object(
    'eligible',v_employee.archived_at is not null and cardinality(v_blockers)=0 and v_employee.auth_user_id is distinct from auth.uid(),
    'archived',v_employee.archived_at is not null,
    'blockers',to_jsonb(v_blockers)
  );
end $$;

create function public.archive_employee(p_tenant_id uuid,p_employee_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees%rowtype; v_photo_path text; v_termination_date date;
begin
  if not public.current_user_has_permission(p_tenant_id,'employee.manage') then
    raise exception 'employee.manage permission required' using errcode='42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'archive reason must be 5 to 500 characters' using errcode='22023';
  end if;
  select * into v_employee from public.employees where tenant_id=p_tenant_id and id=p_employee_id for update;
  if v_employee.id is null then raise exception 'employee not found' using errcode='P0002'; end if;
  if v_employee.auth_user_id=auth.uid() then raise exception 'cannot archive own employee account' using errcode='42501'; end if;
  if v_employee.archived_at is not null then raise exception 'employee already archived' using errcode='55000'; end if;
  v_termination_date:=greatest(v_employee.hire_date,current_date);
  select photo_path into v_photo_path from public.employee_profiles where tenant_id=p_tenant_id and employee_id=p_employee_id;
  update public.employees set status='terminated',archived_at=clock_timestamp(),archived_by=auth.uid(),
    archive_reason=trim(p_reason),updated_at=clock_timestamp()
  where tenant_id=p_tenant_id and id=p_employee_id;
  update public.employment_records set status='terminated',termination_date=coalesce(termination_date,v_termination_date)
  where tenant_id=p_tenant_id and employee_id=p_employee_id and effective_to is null;
  update public.employee_auth_accounts set status='suspended',updated_at=clock_timestamp()
  where tenant_id=p_tenant_id and employee_id=p_employee_id;
  if v_employee.auth_user_id is not null then
    update public.tenant_memberships set status='suspended',updated_at=clock_timestamp()
    where tenant_id=p_tenant_id and user_id=v_employee.auth_user_id;
  end if;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_tenant_id,auth.uid(),'employee.archived','employee',p_employee_id::text,to_jsonb(v_employee),
    jsonb_build_object('status','terminated','archived_at',clock_timestamp(),'reason',trim(p_reason)));
  return jsonb_build_object('auth_user_id',v_employee.auth_user_id,'photo_path',v_photo_path);
end $$;

create function public.restore_archived_employee(p_tenant_id uuid,p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees%rowtype;
begin
  if not public.current_user_has_permission(p_tenant_id,'employee.manage') then
    raise exception 'employee.manage permission required' using errcode='42501';
  end if;
  select * into v_employee from public.employees where tenant_id=p_tenant_id and id=p_employee_id for update;
  if v_employee.id is null then raise exception 'employee not found' using errcode='P0002'; end if;
  if v_employee.archived_at is null then raise exception 'employee is not archived' using errcode='55000'; end if;
  update public.employees set status='active',archived_at=null,archived_by=null,archive_reason=null,updated_at=clock_timestamp()
  where tenant_id=p_tenant_id and id=p_employee_id;
  update public.employment_records set status='active',termination_date=null
  where tenant_id=p_tenant_id and employee_id=p_employee_id and effective_to is null;
  update public.employee_auth_accounts set status='active',updated_at=clock_timestamp()
  where tenant_id=p_tenant_id and employee_id=p_employee_id;
  if v_employee.auth_user_id is not null then
    update public.tenant_memberships set status='active',updated_at=clock_timestamp()
    where tenant_id=p_tenant_id and user_id=v_employee.auth_user_id;
  end if;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_tenant_id,auth.uid(),'employee.restored','employee',p_employee_id::text,to_jsonb(v_employee),jsonb_build_object('status','active'));
  return jsonb_build_object('auth_user_id',v_employee.auth_user_id);
end $$;

create function public.delete_unreferenced_employee(p_tenant_id uuid,p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees%rowtype; v_blockers text[]; v_photo_path text;
begin
  if not public.current_user_has_permission(p_tenant_id,'employee.manage') then
    raise exception 'employee.manage permission required' using errcode='42501';
  end if;
  select * into v_employee from public.employees where tenant_id=p_tenant_id and id=p_employee_id for update;
  if v_employee.id is null then raise exception 'employee not found' using errcode='P0002'; end if;
  if v_employee.auth_user_id=auth.uid() then raise exception 'cannot delete own employee account' using errcode='42501'; end if;
  if v_employee.archived_at is null then raise exception 'employee must be archived before deletion' using errcode='55000'; end if;
  v_blockers:=public.employee_deletion_blockers(p_tenant_id,p_employee_id);
  if cardinality(v_blockers)>0 then
    raise exception 'employee has retained history: %',array_to_string(v_blockers,', ') using errcode='23503';
  end if;
  select photo_path into v_photo_path from public.employee_profiles where tenant_id=p_tenant_id and employee_id=p_employee_id;
  if v_employee.auth_user_id is not null then
    update public.tenant_memberships set status='revoked',updated_at=clock_timestamp()
    where tenant_id=p_tenant_id and user_id=v_employee.auth_user_id;
  end if;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before_data)
  values(p_tenant_id,auth.uid(),'employee.deleted_unreferenced','employee',p_employee_id::text,to_jsonb(v_employee));
  delete from public.employee_auth_accounts where tenant_id=p_tenant_id and employee_id=p_employee_id;
  delete from public.employees where tenant_id=p_tenant_id and id=p_employee_id;
  return jsonb_build_object('auth_user_id',v_employee.auth_user_id,'photo_path',v_photo_path);
exception when foreign_key_violation then
  raise exception 'employee has retained history' using errcode='23503';
end $$;

revoke all on function public.employee_deletion_blockers(uuid,uuid),
  public.get_employee_deletion_eligibility(uuid,uuid),public.archive_employee(uuid,uuid,text),
  public.restore_archived_employee(uuid,uuid),public.delete_unreferenced_employee(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.get_employee_deletion_eligibility(uuid,uuid),public.archive_employee(uuid,uuid,text),
  public.restore_archived_employee(uuid,uuid),public.delete_unreferenced_employee(uuid,uuid) to authenticated;

commit;
