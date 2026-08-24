-- Resolve employment effective dates in the tenant's configured timezone.
-- This prevents UTC date boundaries from closing a Taiwan-dated record before it starts.

create or replace function public.update_employee_master(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_employee_no text,
  p_full_name text,
  p_english_name text,
  p_national_id_ciphertext text,
  p_national_id_hash text,
  p_national_id_last4 text,
  p_birth_date date,
  p_gender public.gender_type,
  p_address text,
  p_mobile text,
  p_email text,
  p_emergency_contact_name text,
  p_emergency_contact_phone text,
  p_department_name text,
  p_position_name text,
  p_supervisor_employee_id uuid,
  p_employment_type public.employment_type,
  p_hire_date date,
  p_termination_date date,
  p_probation_end_date date,
  p_status public.employee_status,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_department_id uuid;
  v_position_id uuid;
  v_current public.employment_records%rowtype;
  v_profile public.employee_profiles%rowtype;
  v_employment_changed boolean;
  v_effective_date date;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;

  if p_supervisor_employee_id = p_employee_id then
    raise exception 'employee cannot supervise self' using errcode = '23514';
  end if;

  select (now() at time zone t.timezone)::date
  into v_effective_date
  from public.tenants t
  where t.id = p_tenant_id;
  if v_effective_date is null then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  select to_jsonb(v) into v_before from public.employee_master_current v
  where v.id = p_employee_id and v.tenant_id = p_tenant_id;
  if v_before is null then raise exception 'employee not found' using errcode = 'P0002'; end if;

  select * into v_profile from public.employee_profiles
  where employee_id = p_employee_id and tenant_id = p_tenant_id for update;

  if nullif(trim(p_department_name), '') is not null then
    insert into public.departments (tenant_id, name) values (p_tenant_id, trim(p_department_name))
    on conflict (tenant_id, name) do update set updated_at = now() returning id into v_department_id;
  end if;
  if nullif(trim(p_position_name), '') is not null then
    insert into public.positions (tenant_id, name) values (p_tenant_id, trim(p_position_name))
    on conflict (tenant_id, name) do update set updated_at = now() returning id into v_position_id;
  end if;

  update public.employees set
    employee_no = upper(trim(p_employee_no)), full_name = trim(p_full_name),
    email = nullif(lower(trim(p_email)), ''), phone = nullif(trim(p_mobile), ''),
    hire_date = p_hire_date, status = p_status, notes = nullif(trim(p_notes), ''), updated_at = now()
  where id = p_employee_id and tenant_id = p_tenant_id;

  update public.employee_profiles set
    english_name = nullif(trim(p_english_name), ''),
    national_id_ciphertext = coalesce(p_national_id_ciphertext, v_profile.national_id_ciphertext),
    national_id_hash = coalesce(p_national_id_hash, v_profile.national_id_hash),
    national_id_last4 = coalesce(p_national_id_last4, v_profile.national_id_last4),
    birth_date = p_birth_date, gender = p_gender, address = nullif(trim(p_address), ''), updated_at = now()
  where employee_id = p_employee_id and tenant_id = p_tenant_id;

  insert into public.employee_contacts (
    employee_id, tenant_id, mobile, email, emergency_contact_name, emergency_contact_phone
  ) values (
    p_employee_id, p_tenant_id, nullif(trim(p_mobile), ''), nullif(lower(trim(p_email)), ''),
    nullif(trim(p_emergency_contact_name), ''), nullif(trim(p_emergency_contact_phone), '')
  ) on conflict (employee_id) do update set
    mobile = excluded.mobile, email = excluded.email,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone, updated_at = now();

  select * into v_current from public.employment_records
  where tenant_id = p_tenant_id and employee_id = p_employee_id and effective_to is null for update;

  v_employment_changed := v_current.department_id is distinct from v_department_id
    or v_current.position_id is distinct from v_position_id
    or v_current.supervisor_employee_id is distinct from p_supervisor_employee_id
    or v_current.employment_type is distinct from p_employment_type
    or v_current.hire_date is distinct from p_hire_date
    or v_current.termination_date is distinct from p_termination_date
    or v_current.probation_end_date is distinct from p_probation_end_date
    or v_current.status is distinct from p_status;

  if v_current.id is null or not v_employment_changed then
    if v_current.id is null then
      insert into public.employment_records (
        tenant_id, employee_id, department_id, position_id, supervisor_employee_id,
        employment_type, hire_date, termination_date, probation_end_date, status, effective_from, created_by
      ) values (
        p_tenant_id, p_employee_id, v_department_id, v_position_id, p_supervisor_employee_id,
        p_employment_type, p_hire_date, p_termination_date, p_probation_end_date, p_status, p_hire_date, (select auth.uid())
      );
    end if;
  elsif v_current.effective_from >= v_effective_date then
    update public.employment_records set
      department_id = v_department_id, position_id = v_position_id,
      supervisor_employee_id = p_supervisor_employee_id, employment_type = p_employment_type,
      hire_date = p_hire_date, termination_date = p_termination_date,
      probation_end_date = p_probation_end_date, status = p_status
    where id = v_current.id;
  else
    update public.employment_records set effective_to = v_effective_date - 1 where id = v_current.id;
    insert into public.employment_records (
      tenant_id, employee_id, department_id, position_id, supervisor_employee_id,
      employment_type, hire_date, termination_date, probation_end_date, status, effective_from, created_by
    ) values (
      p_tenant_id, p_employee_id, v_department_id, v_position_id, p_supervisor_employee_id,
      p_employment_type, p_hire_date, p_termination_date, p_probation_end_date, p_status, v_effective_date, (select auth.uid())
    );
  end if;

  select to_jsonb(v) into v_after from public.employee_master_current v
  where v.id = p_employee_id and v.tenant_id = p_tenant_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_tenant_id, (select auth.uid()), 'employee.updated', 'employee', p_employee_id::text, v_before, v_after);
end;
$$;

revoke all on function public.update_employee_master(uuid,uuid,text,text,text,text,text,text,date,public.gender_type,text,text,text,text,text,text,text,uuid,public.employment_type,date,date,date,public.employee_status,text) from public;
grant execute on function public.update_employee_master(uuid,uuid,text,text,text,text,text,text,date,public.gender_type,text,text,text,text,text,text,text,uuid,public.employment_type,date,date,date,public.employee_status,text) to authenticated;
