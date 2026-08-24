begin;

create type public.gender_type as enum ('male', 'female', 'non_binary', 'undisclosed');
create type public.employment_type as enum ('full_time', 'part_time', 'hourly', 'contract', 'temporary');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  status public.organization_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table public.employee_profiles (
  employee_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  english_name text check (english_name is null or char_length(english_name) <= 120),
  national_id_ciphertext text,
  national_id_hash text,
  national_id_last4 text check (national_id_last4 is null or national_id_last4 ~ '^[A-Z0-9]{4}$'),
  birth_date date,
  gender public.gender_type,
  address text check (address is null or char_length(address) <= 300),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade,
  unique (tenant_id, employee_id),
  unique (tenant_id, national_id_hash)
);

create table public.employee_contacts (
  employee_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  mobile text check (mobile is null or char_length(mobile) <= 30),
  email text check (email is null or char_length(email) <= 254),
  emergency_contact_name text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 80),
  emergency_contact_phone text check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade,
  unique (tenant_id, employee_id)
);

create table public.employment_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  department_id uuid,
  position_id uuid,
  supervisor_employee_id uuid,
  employment_type public.employment_type not null,
  hire_date date not null,
  termination_date date,
  probation_end_date date,
  status public.employee_status not null default 'active',
  effective_from date not null,
  effective_to date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade,
  foreign key (tenant_id, department_id) references public.departments(tenant_id, id) on delete restrict,
  foreign key (tenant_id, position_id) references public.positions(tenant_id, id) on delete restrict,
  foreign key (tenant_id, supervisor_employee_id) references public.employees(tenant_id, id) on delete restrict,
  check (supervisor_employee_id is null or supervisor_employee_id <> employee_id),
  check (termination_date is null or termination_date >= hire_date),
  check (probation_end_date is null or probation_end_date >= hire_date),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index employment_records_current_employee_idx
  on public.employment_records (tenant_id, employee_id)
  where effective_to is null;
create index employment_records_tenant_department_idx
  on public.employment_records (tenant_id, department_id, status)
  where effective_to is null;

insert into public.employee_profiles (employee_id, tenant_id)
select id, tenant_id from public.employees
on conflict (employee_id) do nothing;

insert into public.employee_contacts (employee_id, tenant_id, mobile, email)
select id, tenant_id, phone, email from public.employees
on conflict (employee_id) do nothing;

insert into public.employment_records (
  tenant_id, employee_id, employment_type, hire_date, status, effective_from, created_by
)
select tenant_id, id, 'full_time', hire_date, status, hire_date, created_by
from public.employees
on conflict do nothing;

alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.employee_contacts enable row level security;
alter table public.employment_records enable row level security;

create policy departments_select_same_tenant on public.departments for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy positions_select_same_tenant on public.positions for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy employee_profiles_select_same_tenant on public.employee_profiles for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy employee_contacts_select_same_tenant on public.employee_contacts for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy employment_records_select_same_tenant on public.employment_records for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

revoke all privileges on table
  public.departments, public.positions, public.employee_profiles,
  public.employee_contacts, public.employment_records
from anon, authenticated;

grant select on table
  public.departments, public.positions, public.employee_profiles,
  public.employee_contacts, public.employment_records
to authenticated;

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
  e.updated_at
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

create or replace function public.create_employee_master(
  p_tenant_id uuid,
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_department_id uuid;
  v_position_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;

  if p_national_id_ciphertext is null or p_national_id_hash is null or p_birth_date is null or p_gender is null then
    raise exception 'required employee profile fields missing' using errcode = '23502';
  end if;

  if nullif(trim(p_department_name), '') is not null then
    insert into public.departments (tenant_id, name)
    values (p_tenant_id, trim(p_department_name))
    on conflict (tenant_id, name) do update set updated_at = now()
    returning id into v_department_id;
  end if;

  if nullif(trim(p_position_name), '') is not null then
    insert into public.positions (tenant_id, name)
    values (p_tenant_id, trim(p_position_name))
    on conflict (tenant_id, name) do update set updated_at = now()
    returning id into v_position_id;
  end if;

  insert into public.employees (
    tenant_id, employee_no, full_name, email, phone, hire_date, status, notes, created_by
  ) values (
    p_tenant_id, upper(trim(p_employee_no)), trim(p_full_name), nullif(lower(trim(p_email)), ''),
    nullif(trim(p_mobile), ''), p_hire_date, p_status, nullif(trim(p_notes), ''), (select auth.uid())
  ) returning id into v_employee_id;

  insert into public.employee_profiles (
    employee_id, tenant_id, english_name, national_id_ciphertext, national_id_hash,
    national_id_last4, birth_date, gender, address
  ) values (
    v_employee_id, p_tenant_id, nullif(trim(p_english_name), ''), p_national_id_ciphertext,
    p_national_id_hash, p_national_id_last4, p_birth_date, p_gender, nullif(trim(p_address), '')
  );

  insert into public.employee_contacts (
    employee_id, tenant_id, mobile, email, emergency_contact_name, emergency_contact_phone
  ) values (
    v_employee_id, p_tenant_id, nullif(trim(p_mobile), ''), nullif(lower(trim(p_email)), ''),
    nullif(trim(p_emergency_contact_name), ''), nullif(trim(p_emergency_contact_phone), '')
  );

  insert into public.employment_records (
    tenant_id, employee_id, department_id, position_id, supervisor_employee_id,
    employment_type, hire_date, termination_date, probation_end_date, status,
    effective_from, created_by
  ) values (
    p_tenant_id, v_employee_id, v_department_id, v_position_id, p_supervisor_employee_id,
    p_employment_type, p_hire_date, p_termination_date, p_probation_end_date, p_status,
    p_hire_date, (select auth.uid())
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  )
  select p_tenant_id, (select auth.uid()), 'employee.created', 'employee',
    v_employee_id::text, to_jsonb(v)
  from public.employee_master_current v where v.id = v_employee_id;

  return v_employee_id;
end;
$$;

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
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;

  if p_supervisor_employee_id = p_employee_id then
    raise exception 'employee cannot supervise self' using errcode = '23514';
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
  elsif v_current.effective_from = current_date then
    update public.employment_records set
      department_id = v_department_id, position_id = v_position_id,
      supervisor_employee_id = p_supervisor_employee_id, employment_type = p_employment_type,
      hire_date = p_hire_date, termination_date = p_termination_date,
      probation_end_date = p_probation_end_date, status = p_status
    where id = v_current.id;
  else
    update public.employment_records set effective_to = current_date - 1 where id = v_current.id;
    insert into public.employment_records (
      tenant_id, employee_id, department_id, position_id, supervisor_employee_id,
      employment_type, hire_date, termination_date, probation_end_date, status, effective_from, created_by
    ) values (
      p_tenant_id, p_employee_id, v_department_id, v_position_id, p_supervisor_employee_id,
      p_employment_type, p_hire_date, p_termination_date, p_probation_end_date, p_status, current_date, (select auth.uid())
    );
  end if;

  select to_jsonb(v) into v_after from public.employee_master_current v
  where v.id = p_employee_id and v.tenant_id = p_tenant_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_tenant_id, (select auth.uid()), 'employee.updated', 'employee', p_employee_id::text, v_before, v_after);
end;
$$;

create or replace function public.set_employee_photo(
  p_tenant_id uuid, p_employee_id uuid, p_photo_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text;
begin
  if not public.current_user_has_permission(p_tenant_id, 'employee.manage') then
    raise exception 'employee.manage permission required' using errcode = '42501';
  end if;
  select photo_path into v_before from public.employee_profiles
  where tenant_id = p_tenant_id and employee_id = p_employee_id for update;
  update public.employee_profiles set photo_path = p_photo_path, updated_at = now()
  where tenant_id = p_tenant_id and employee_id = p_employee_id;
  if not found then raise exception 'employee not found' using errcode = 'P0002'; end if;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    p_tenant_id, (select auth.uid()), 'employee.photo_updated', 'employee', p_employee_id::text,
    jsonb_build_object('photo_path', v_before), jsonb_build_object('photo_path', p_photo_path)
  );
end;
$$;

revoke all on function public.create_employee_master(uuid,text,text,text,text,text,text,date,public.gender_type,text,text,text,text,text,text,text,uuid,public.employment_type,date,date,date,public.employee_status,text) from public;
revoke all on function public.update_employee_master(uuid,uuid,text,text,text,text,text,text,date,public.gender_type,text,text,text,text,text,text,text,uuid,public.employment_type,date,date,date,public.employee_status,text) from public;
revoke all on function public.set_employee_photo(uuid,uuid,text) from public;
grant execute on function public.create_employee_master(uuid,text,text,text,text,text,text,date,public.gender_type,text,text,text,text,text,text,text,uuid,public.employment_type,date,date,date,public.employee_status,text) to authenticated;
grant execute on function public.update_employee_master(uuid,uuid,text,text,text,text,text,text,date,public.gender_type,text,text,text,text,text,text,text,uuid,public.employment_type,date,date,date,public.employee_status,text) to authenticated;
grant execute on function public.set_employee_photo(uuid,uuid,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy employee_photos_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos' and public.current_user_has_permission(((storage.foldername(name))[1])::uuid, 'employee.manage'));
create policy employee_photos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-photos' and public.current_user_has_permission(((storage.foldername(name))[1])::uuid, 'employee.manage'));
create policy employee_photos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'employee-photos' and public.current_user_has_permission(((storage.foldername(name))[1])::uuid, 'employee.manage'))
  with check (bucket_id = 'employee-photos' and public.current_user_has_permission(((storage.foldername(name))[1])::uuid, 'employee.manage'));
create policy employee_photos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-photos' and public.current_user_has_permission(((storage.foldername(name))[1])::uuid, 'employee.manage'));

commit;
