begin;

create type public.work_request_type as enum ('leave', 'overtime');
create type public.work_request_decision_type as enum ('approved', 'rejected');

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  name text not null check (char_length(name) between 1 and 40),
  description text check (description is null or char_length(description) <= 200),
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table public.work_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  request_type public.work_request_type not null,
  leave_type_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (char_length(timezone) between 1 and 64),
  requested_minutes integer not null check (requested_minutes between 1 and 44640),
  reason text not null check (char_length(reason) between 5 and 500),
  idempotency_key uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, idempotency_key),
  foreign key (tenant_id, employee_id)
    references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, leave_type_id)
    references public.leave_types(tenant_id, id) on delete restrict,
  check (ends_at > starts_at),
  check (
    (request_type = 'leave' and leave_type_id is not null)
    or (request_type = 'overtime' and leave_type_id is null)
  )
);

create table public.work_request_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  work_request_id uuid not null,
  decision public.work_request_decision_type not null,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (work_request_id),
  foreign key (tenant_id, work_request_id)
    references public.work_requests(tenant_id, id) on delete restrict
);

create index work_requests_tenant_requested_idx
  on public.work_requests (tenant_id, requested_at desc);
create index work_requests_employee_requested_idx
  on public.work_requests (tenant_id, employee_id, requested_at desc);
create index work_request_decisions_tenant_decided_idx
  on public.work_request_decisions (tenant_id, decided_at desc);

insert into public.leave_types (tenant_id, code, name, description)
select t.id, defaults.code, defaults.name, defaults.description
from public.tenants t
cross join (values
  ('PERSONAL', '事假', '一般個人事務請假；扣薪與額度規則尚未設定。'),
  ('SICK', '病假', '因傷病提出請假；證明與扣薪規則尚未設定。'),
  ('ANNUAL', '特別休假', '特別休假申請；可用額度尚未由本模組計算。'),
  ('OTHER', '其他請假', '不屬於既有分類的請假。')
) as defaults(code, name, description)
on conflict (tenant_id, code) do nothing;

insert into public.permissions (code, description)
values ('request.manage', '檢視與審核員工請假及加班申請')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'platform_admin' and p.code = 'request.manage'
on conflict (role_id, permission_id) do nothing;

alter table public.leave_types enable row level security;
alter table public.work_requests enable row level security;
alter table public.work_request_decisions enable row level security;

create policy leave_types_member_read on public.leave_types for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));
create policy work_requests_manager_or_self on public.work_requests for select to authenticated
  using (
    public.current_user_has_permission(tenant_id, 'request.manage')
    or employee_id in (
      select e.id from public.employees e
      where e.tenant_id = work_requests.tenant_id
        and e.auth_user_id = (select auth.uid())
    )
  );
create policy work_request_decisions_manager_or_self on public.work_request_decisions for select to authenticated
  using (work_request_id in (select wr.id from public.work_requests wr));

revoke all privileges on table public.leave_types from anon, authenticated;
revoke all privileges on table public.work_requests from anon, authenticated;
revoke all privileges on table public.work_request_decisions from anon, authenticated;
grant select on table public.leave_types, public.work_requests, public.work_request_decisions to authenticated;

create or replace function public.create_work_request(
  p_tenant_id uuid,
  p_request_type public.work_request_type,
  p_leave_type_id uuid,
  p_starts_local timestamp,
  p_ends_local timestamp,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_request_id uuid;
  v_timezone text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_requested_minutes integer;
begin
  select e.id, t.timezone into v_employee_id, v_timezone
  from public.employees e
  join public.tenants t on t.id = e.tenant_id and t.status = 'active'
  where e.tenant_id = p_tenant_id
    and e.auth_user_id = (select auth.uid())
    and e.status = 'active'
    and exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = e.tenant_id
        and tm.user_id = (select auth.uid())
        and tm.status = 'active'
    )
  limit 1;

  if v_employee_id is null then
    raise exception 'active linked employee required' using errcode = '42501';
  end if;
  if p_request_type is null or p_starts_local is null or p_ends_local is null
     or p_idempotency_key is null then
    raise exception 'request fields required' using errcode = '22023';
  end if;
  if char_length(trim(p_reason)) not between 5 and 500 then
    raise exception 'request reason must be 5 to 500 characters' using errcode = '22023';
  end if;
  if p_request_type = 'leave' then
    if p_leave_type_id is null or not exists (
      select 1 from public.leave_types lt
      where lt.tenant_id = p_tenant_id and lt.id = p_leave_type_id and lt.is_active
    ) then
      raise exception 'active leave type required' using errcode = '22023';
    end if;
  elsif p_leave_type_id is not null then
    raise exception 'overtime request cannot have leave type' using errcode = '22023';
  end if;

  v_starts_at := p_starts_local at time zone v_timezone;
  v_ends_at := p_ends_local at time zone v_timezone;
  v_requested_minutes := floor(extract(epoch from (v_ends_at - v_starts_at)) / 60)::integer;
  if v_requested_minutes not between 1 and 44640 then
    raise exception 'request duration must be between 1 minute and 31 days' using errcode = '22023';
  end if;
  if p_starts_local::date < ((statement_timestamp() at time zone v_timezone)::date - 62)
     or p_starts_local::date > ((statement_timestamp() at time zone v_timezone)::date + 366) then
    raise exception 'request date outside allowed window' using errcode = '22023';
  end if;

  select id into v_request_id from public.work_requests
  where tenant_id = p_tenant_id and employee_id = v_employee_id
    and idempotency_key = p_idempotency_key;
  if v_request_id is not null then return v_request_id; end if;

  insert into public.work_requests (
    tenant_id, employee_id, request_type, leave_type_id, starts_at, ends_at,
    timezone, requested_minutes, reason, idempotency_key, requested_by
  ) values (
    p_tenant_id, v_employee_id, p_request_type,
    case when p_request_type = 'leave' then p_leave_type_id else null end,
    v_starts_at, v_ends_at, v_timezone, v_requested_minutes,
    trim(p_reason), p_idempotency_key, (select auth.uid())
  ) returning id into v_request_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_tenant_id, (select auth.uid()), 'work_request.requested', 'work_request', v_request_id::text,
    jsonb_build_object('employee_id', v_employee_id, 'request_type', p_request_type,
      'starts_at', v_starts_at, 'ends_at', v_ends_at, 'requested_minutes', v_requested_minutes)
  );
  return v_request_id;
end;
$$;

create or replace function public.decide_work_request(
  p_tenant_id uuid,
  p_request_id uuid,
  p_decision public.work_request_decision_type,
  p_review_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_decision_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'request.manage') then
    raise exception 'request.manage permission required' using errcode = '42501';
  end if;
  if p_decision is null then
    raise exception 'decision required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.work_requests
    where tenant_id = p_tenant_id and id = p_request_id
  ) then
    raise exception 'work request not found' using errcode = 'P0002';
  end if;
  if p_review_note is not null and char_length(trim(p_review_note)) > 500 then
    raise exception 'review note too long' using errcode = '22023';
  end if;

  insert into public.work_request_decisions (
    tenant_id, work_request_id, decision, review_note, decided_by
  ) values (
    p_tenant_id, p_request_id, p_decision, nullif(trim(p_review_note), ''), (select auth.uid())
  ) returning id into v_decision_id;

  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_tenant_id, (select auth.uid()), 'work_request.' || p_decision::text,
    'work_request', p_request_id::text,
    jsonb_build_object('decision_id', v_decision_id, 'decision', p_decision,
      'review_note', nullif(trim(p_review_note), ''))
  );
  return v_decision_id;
exception when unique_violation then
  raise exception 'work request already decided' using errcode = '55000';
end;
$$;

drop function public.get_current_workspace_context();
create function public.get_current_workspace_context()
returns table (
  user_id uuid,
  email text,
  user_metadata jsonb,
  tenant_id uuid,
  tenant_name text,
  employee_id uuid,
  can_manage_employee boolean,
  can_manage_schedule boolean,
  can_manage_attendance boolean,
  can_manage_request boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    coalesce(u.email, ''),
    coalesce(u.raw_user_meta_data, '{}'::jsonb),
    membership.tenant_id,
    membership.tenant_name,
    employee.id,
    coalesce(public.current_user_has_permission(membership.tenant_id, 'employee.manage'), false),
    coalesce(public.current_user_has_permission(membership.tenant_id, 'schedule.manage'), false),
    coalesce(public.current_user_has_permission(membership.tenant_id, 'attendance.manage'), false),
    coalesce(public.current_user_has_permission(membership.tenant_id, 'request.manage'), false)
  from auth.users u
  left join lateral (
    select tm.tenant_id, t.name as tenant_name
    from public.tenant_memberships tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = u.id and tm.status = 'active'
    order by tm.created_at, tm.id
    limit 1
  ) membership on true
  left join lateral (
    select e.id
    from public.employees e
    where e.tenant_id = membership.tenant_id
      and e.auth_user_id = u.id
      and e.status = 'active'
    order by e.created_at, e.id
    limit 1
  ) employee on true
  where u.id = (select auth.uid());
$$;

revoke all on function public.create_work_request(uuid, public.work_request_type, uuid, timestamp, timestamp, text, uuid) from public;
revoke all on function public.decide_work_request(uuid, uuid, public.work_request_decision_type, text) from public;
revoke all on function public.get_current_workspace_context() from public, anon;
grant execute on function public.create_work_request(uuid, public.work_request_type, uuid, timestamp, timestamp, text, uuid) to authenticated;
grant execute on function public.decide_work_request(uuid, uuid, public.work_request_decision_type, text) to authenticated;
grant execute on function public.get_current_workspace_context() to authenticated;

commit;
