begin;

alter type public.attendance_day_status add value if not exists 'leave';

create table public.work_request_withdrawals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  work_request_id uuid not null,
  withdrawn_by uuid not null references auth.users(id) on delete restrict,
  withdrawn_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (work_request_id),
  foreign key (tenant_id, work_request_id)
    references public.work_requests(tenant_id, id) on delete restrict
);

create table public.leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  leave_type_id uuid not null,
  entitlement_year integer not null check (entitlement_year between 2000 and 2200),
  entitled_minutes integer not null check (entitled_minutes between 0 and 527040),
  note text check (note is null or char_length(note) <= 200),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, leave_type_id, entitlement_year),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, leave_type_id) references public.leave_types(tenant_id, id) on delete restrict
);

alter table public.attendance_days
  add column approved_leave_minutes integer not null default 0 check (approved_leave_minutes >= 0),
  add column approved_overtime_minutes integer not null default 0 check (approved_overtime_minutes >= 0);

alter table public.work_request_withdrawals enable row level security;
alter table public.leave_entitlements enable row level security;

create policy work_request_withdrawals_manager_or_self on public.work_request_withdrawals for select to authenticated
  using (work_request_id in (select wr.id from public.work_requests wr));
create policy leave_entitlements_manager_or_self on public.leave_entitlements for select to authenticated
  using (
    public.current_user_has_permission(tenant_id, 'request.manage')
    or employee_id in (
      select e.id from public.employees e
      where e.tenant_id = leave_entitlements.tenant_id and e.auth_user_id = (select auth.uid())
    )
  );

revoke all privileges on table public.work_request_withdrawals, public.leave_entitlements from anon, authenticated;
grant select on table public.work_request_withdrawals, public.leave_entitlements to authenticated;

create or replace function public.withdraw_work_request(p_tenant_id uuid, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_withdrawal_id uuid;
begin
  if not exists (
    select 1 from public.work_requests wr
    join public.employees e on e.tenant_id = wr.tenant_id and e.id = wr.employee_id
    where wr.tenant_id = p_tenant_id and wr.id = p_request_id
      and e.auth_user_id = (select auth.uid()) and e.status = 'active'
      and not exists (select 1 from public.work_request_decisions d where d.work_request_id = wr.id)
  ) then
    raise exception 'only own pending request can be withdrawn' using errcode = '42501';
  end if;

  insert into public.work_request_withdrawals (tenant_id, work_request_id, withdrawn_by)
  values (p_tenant_id, p_request_id, (select auth.uid())) returning id into v_withdrawal_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, (select auth.uid()), 'work_request.withdrawn', 'work_request', p_request_id::text,
    jsonb_build_object('withdrawal_id', v_withdrawal_id));
  return v_withdrawal_id;
exception when unique_violation then
  raise exception 'work request already withdrawn' using errcode = '55000';
end;
$$;

create or replace function public.upsert_leave_entitlement(
  p_tenant_id uuid, p_employee_id uuid, p_leave_type_id uuid, p_entitlement_year integer,
  p_entitled_minutes integer, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'request.manage') then
    raise exception 'request.manage permission required' using errcode = '42501';
  end if;
  if p_entitlement_year not between 2000 and 2200 or p_entitled_minutes not between 0 and 527040 then
    raise exception 'invalid leave entitlement' using errcode = '22023';
  end if;
  if not exists (select 1 from public.employees where tenant_id = p_tenant_id and id = p_employee_id)
     or not exists (select 1 from public.leave_types where tenant_id = p_tenant_id and id = p_leave_type_id and is_active) then
    raise exception 'employee or leave type not found' using errcode = 'P0002';
  end if;
  insert into public.leave_entitlements (
    tenant_id, employee_id, leave_type_id, entitlement_year, entitled_minutes, note, updated_by
  ) values (
    p_tenant_id, p_employee_id, p_leave_type_id, p_entitlement_year, p_entitled_minutes,
    nullif(trim(p_note), ''), (select auth.uid())
  ) on conflict (tenant_id, employee_id, leave_type_id, entitlement_year) do update set
    entitled_minutes = excluded.entitled_minutes, note = excluded.note,
    updated_by = excluded.updated_by, updated_at = statement_timestamp()
  returning id into v_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, (select auth.uid()), 'leave_entitlement.upserted', 'leave_entitlement', v_id::text,
    jsonb_build_object('employee_id', p_employee_id, 'leave_type_id', p_leave_type_id,
      'entitlement_year', p_entitlement_year, 'entitled_minutes', p_entitled_minutes));
  return v_id;
end;
$$;

create or replace function public.decide_work_request(
  p_tenant_id uuid, p_request_id uuid, p_decision public.work_request_decision_type, p_review_note text
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
  if p_decision is null then raise exception 'decision required' using errcode = '22023'; end if;
  if not exists (select 1 from public.work_requests where tenant_id = p_tenant_id and id = p_request_id) then
    raise exception 'work request not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.work_request_withdrawals where work_request_id = p_request_id) then
    raise exception 'withdrawn work request cannot be decided' using errcode = '55000';
  end if;
  if p_review_note is not null and char_length(trim(p_review_note)) > 500 then
    raise exception 'review note too long' using errcode = '22023';
  end if;
  insert into public.work_request_decisions (tenant_id, work_request_id, decision, review_note, decided_by)
  values (p_tenant_id, p_request_id, p_decision, nullif(trim(p_review_note), ''), (select auth.uid()))
  returning id into v_decision_id;
  insert into public.audit_logs (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, (select auth.uid()), 'work_request.' || p_decision::text, 'work_request', p_request_id::text,
    jsonb_build_object('decision_id', v_decision_id, 'decision', p_decision, 'review_note', nullif(trim(p_review_note), '')));
  return v_decision_id;
exception when unique_violation then
  raise exception 'work request already decided' using errcode = '55000';
end;
$$;

alter function public.calculate_attendance(uuid, date, date) rename to calculate_attendance_v1;
create function public.calculate_attendance(p_tenant_id uuid, p_date_from date, p_date_to date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_run_id uuid;
begin
  v_run_id := public.calculate_attendance_v1(p_tenant_id, p_date_from, p_date_to);
  update public.attendance_days ad set
    approved_leave_minutes = (
      select coalesce(sum(greatest(0, floor(extract(epoch from (
        least(wr.ends_at, aseg.scheduled_end_at) - greatest(wr.starts_at, aseg.scheduled_start_at)
      )) / 60)::integer)), 0)
      from public.attendance_segments aseg
      join public.work_requests wr on wr.tenant_id = ad.tenant_id and wr.employee_id = ad.employee_id
        and wr.request_type = 'leave'
        and wr.starts_at < aseg.scheduled_end_at and wr.ends_at > aseg.scheduled_start_at
        and exists (select 1 from public.work_request_decisions d
          where d.work_request_id = wr.id and d.decision = 'approved')
        and not exists (select 1 from public.work_request_withdrawals w where w.work_request_id = wr.id)
      where aseg.attendance_day_id = ad.id
    ),
    approved_overtime_minutes = (
      select coalesce(sum(greatest(0, floor(extract(epoch from (
        least(wr.ends_at, ((ad.work_date + 1)::timestamp at time zone wr.timezone)) -
        greatest(wr.starts_at, (ad.work_date::timestamp at time zone wr.timezone))
      )) / 60)::integer)), 0)
      from public.work_requests wr
      where wr.tenant_id = ad.tenant_id and wr.employee_id = ad.employee_id
        and wr.request_type = 'overtime'
        and wr.starts_at < ((ad.work_date + 1)::timestamp at time zone wr.timezone)
        and wr.ends_at > (ad.work_date::timestamp at time zone wr.timezone)
        and exists (select 1 from public.work_request_decisions d
          where d.work_request_id = wr.id and d.decision = 'approved')
        and not exists (select 1 from public.work_request_withdrawals w where w.work_request_id = wr.id)
    )
  where ad.calculation_run_id = v_run_id;

  delete from public.attendance_exceptions ae using public.attendance_days ad
  where ae.attendance_day_id = ad.id and ad.calculation_run_id = v_run_id
    and ad.scheduled_minutes > 0 and ad.approved_leave_minutes >= ad.scheduled_minutes
    and ae.exception_type in ('missing_clock_in', 'missing_clock_out', 'late', 'early_leave');
  update public.attendance_days ad set status = 'leave',
    exception_count = (select count(*) from public.attendance_exceptions ae where ae.attendance_day_id = ad.id)
  where ad.calculation_run_id = v_run_id and ad.scheduled_minutes > 0
    and ad.approved_leave_minutes >= ad.scheduled_minutes;
  return v_run_id;
end;
$$;

revoke all on function public.withdraw_work_request(uuid, uuid) from public;
revoke all on function public.upsert_leave_entitlement(uuid, uuid, uuid, integer, integer, text) from public;
revoke all on function public.calculate_attendance_v1(uuid, date, date) from public, anon, authenticated;
revoke all on function public.calculate_attendance(uuid, date, date) from public;
grant execute on function public.withdraw_work_request(uuid, uuid) to authenticated;
grant execute on function public.upsert_leave_entitlement(uuid, uuid, uuid, integer, integer, text) to authenticated;
grant execute on function public.calculate_attendance(uuid, date, date) to authenticated;

commit;
