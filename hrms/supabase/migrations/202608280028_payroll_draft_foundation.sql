begin;

create type public.payroll_period_status as enum ('draft', 'reviewed', 'locked');
create type public.payroll_item_kind as enum ('earning', 'deduction');

create table public.payroll_components (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,31}$'), name text not null check (char_length(name) between 1 and 40),
  kind public.payroll_item_kind not null, is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(), unique (tenant_id, id), unique (tenant_id, code)
);

create table public.employee_compensation_versions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null, effective_from date not null, monthly_base_cents bigint not null check (monthly_base_cents >= 0),
  note text check (note is null or char_length(note) <= 200), created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(), unique (tenant_id, id), unique (tenant_id, employee_id, effective_from),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict
);

create table public.payroll_rule_versions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  effective_from date not null, version integer not null check (version > 0), rules jsonb not null default '{}'::jsonb,
  source_note text check (source_note is null or char_length(source_note) <= 500), created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(), unique (tenant_id, id), unique (tenant_id, version), unique (tenant_id, effective_from)
);

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  period_month date not null check (period_month = date_trunc('month', period_month)::date), period_start date not null, period_end date not null,
  pay_date date, status public.payroll_period_status not null default 'draft', calculated_at timestamptz, calculated_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz, reviewed_by uuid references auth.users(id) on delete restrict, locked_at timestamptz, locked_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(), unique (tenant_id, id), unique (tenant_id, period_month), check (period_end >= period_start)
);

create table public.payroll_entries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  payroll_period_id uuid not null, employee_id uuid not null, compensation_version_id uuid,
  gross_cents bigint not null default 0, deduction_cents bigint not null default 0, net_cents bigint not null default 0,
  source_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id), unique (payroll_period_id, employee_id),
  foreign key (tenant_id, payroll_period_id) references public.payroll_periods(tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict,
  foreign key (tenant_id, compensation_version_id) references public.employee_compensation_versions(tenant_id, id) on delete restrict,
  check (gross_cents >= 0 and deduction_cents >= 0 and net_cents = gross_cents - deduction_cents)
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete restrict,
  payroll_entry_id uuid not null, component_id uuid, code text not null, name text not null,
  kind public.payroll_item_kind not null, amount_cents bigint not null check (amount_cents >= 0), source text not null,
  note text check (note is null or char_length(note) <= 200), created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(), unique (tenant_id, id),
  foreign key (tenant_id, payroll_entry_id) references public.payroll_entries(tenant_id, id) on delete cascade,
  foreign key (tenant_id, component_id) references public.payroll_components(tenant_id, id) on delete restrict
);

create index employee_compensation_effective_idx on public.employee_compensation_versions (tenant_id, employee_id, effective_from desc);
create index payroll_entries_period_idx on public.payroll_entries (tenant_id, payroll_period_id, employee_id);
create index payroll_items_entry_idx on public.payroll_items (tenant_id, payroll_entry_id, kind);

insert into public.permissions (code, description) values ('payroll.manage', '設定、試算、核對與鎖定薪資')
on conflict (code) do update set description = excluded.description;
insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'platform_admin' and p.code = 'payroll.manage' on conflict (role_id, permission_id) do nothing;

alter table public.payroll_components enable row level security;
alter table public.employee_compensation_versions enable row level security;
alter table public.payroll_rule_versions enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_items enable row level security;

create policy payroll_components_manager_read on public.payroll_components for select to authenticated using (public.current_user_has_permission(tenant_id, 'payroll.manage'));
create policy compensation_manager_read on public.employee_compensation_versions for select to authenticated using (public.current_user_has_permission(tenant_id, 'payroll.manage'));
create policy payroll_rules_manager_read on public.payroll_rule_versions for select to authenticated using (public.current_user_has_permission(tenant_id, 'payroll.manage'));
create policy payroll_periods_manager_or_locked_self on public.payroll_periods for select to authenticated using (
  public.current_user_has_permission(tenant_id, 'payroll.manage') or (status = 'locked' and exists (
    select 1 from public.payroll_entries pe join public.employees e on e.tenant_id = pe.tenant_id and e.id = pe.employee_id
    where pe.payroll_period_id = payroll_periods.id and e.auth_user_id = (select auth.uid())
  ))
);
create policy payroll_entries_manager_or_locked_self on public.payroll_entries for select to authenticated using (
  public.current_user_has_permission(tenant_id, 'payroll.manage') or (
    employee_id in (select e.id from public.employees e where e.tenant_id = payroll_entries.tenant_id and e.auth_user_id = (select auth.uid()))
    and payroll_period_id in (select pp.id from public.payroll_periods pp where pp.status = 'locked')
  )
);
create policy payroll_items_manager_or_locked_self on public.payroll_items for select to authenticated using (payroll_entry_id in (select pe.id from public.payroll_entries pe));

revoke all privileges on table public.payroll_components, public.employee_compensation_versions, public.payroll_rule_versions, public.payroll_periods, public.payroll_entries, public.payroll_items from anon, authenticated;
grant select on table public.payroll_components, public.employee_compensation_versions, public.payroll_rule_versions, public.payroll_periods, public.payroll_entries, public.payroll_items to authenticated;

create function public.upsert_employee_compensation(p_tenant_id uuid, p_employee_id uuid, p_effective_from date, p_monthly_base_cents bigint, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  if p_effective_from is null or p_monthly_base_cents is null or p_monthly_base_cents < 0 then raise exception 'invalid compensation' using errcode='22023'; end if;
  if not exists(select 1 from public.employees where tenant_id=p_tenant_id and id=p_employee_id) then raise exception 'employee not found' using errcode='P0002'; end if;
  insert into public.employee_compensation_versions(tenant_id,employee_id,effective_from,monthly_base_cents,note,created_by)
  values(p_tenant_id,p_employee_id,p_effective_from,p_monthly_base_cents,nullif(trim(p_note),''),(select auth.uid()))
  on conflict(tenant_id,employee_id,effective_from) do update set monthly_base_cents=excluded.monthly_base_cents,note=excluded.note,created_by=excluded.created_by,created_at=statement_timestamp()
  returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values
  (p_tenant_id,(select auth.uid()),'payroll.compensation_upserted','employee_compensation',v_id::text,jsonb_build_object('employee_id',p_employee_id,'effective_from',p_effective_from,'monthly_base_cents',p_monthly_base_cents));
  return v_id;
end $$;

create function public.create_payroll_period(p_tenant_id uuid, p_period_month date, p_pay_date date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_month date := date_trunc('month',p_period_month)::date; v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  insert into public.payroll_periods(tenant_id,period_month,period_start,period_end,pay_date)
  values(p_tenant_id,v_month,v_month,(v_month+interval '1 month'-interval '1 day')::date,p_pay_date) returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values
  (p_tenant_id,(select auth.uid()),'payroll.period_created','payroll_period',v_id::text,jsonb_build_object('period_month',v_month,'pay_date',p_pay_date));
  return v_id;
exception when unique_violation then raise exception 'payroll period already exists' using errcode='23505';
end $$;

create function public.calculate_payroll_draft(p_tenant_id uuid, p_period_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_period public.payroll_periods%rowtype; v_count integer;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  select * into v_period from public.payroll_periods where tenant_id=p_tenant_id and id=p_period_id for update;
  if v_period.id is null then raise exception 'payroll period not found' using errcode='P0002'; end if;
  if v_period.status <> 'draft' then raise exception 'only draft payroll can be recalculated' using errcode='55000'; end if;
  delete from public.payroll_entries where payroll_period_id=p_period_id;
  insert into public.payroll_entries(tenant_id,payroll_period_id,employee_id,compensation_version_id,gross_cents,deduction_cents,net_cents,source_snapshot)
  select p_tenant_id,p_period_id,e.id,cv.id,coalesce(cv.monthly_base_cents,0),0,coalesce(cv.monthly_base_cents,0),
    jsonb_build_object('period_start',v_period.period_start,'period_end',v_period.period_end,'compensation_configured',cv.id is not null,
      'attendance',coalesce((select jsonb_build_object('scheduled_minutes',sum(ad.scheduled_minutes),'actual_minutes',sum(ad.actual_minutes),'approved_leave_minutes',sum(ad.approved_leave_minutes),'approved_overtime_minutes',sum(ad.approved_overtime_minutes),'exception_count',sum(ad.exception_count))
        from public.attendance_days ad where ad.tenant_id=p_tenant_id and ad.employee_id=e.id and ad.work_date between v_period.period_start and v_period.period_end),'{}'::jsonb),
      'automatic_deductions_applied',false,'insurance_tax_applied',false)
  from public.employees e left join lateral (select ecv.* from public.employee_compensation_versions ecv where ecv.tenant_id=e.tenant_id and ecv.employee_id=e.id and ecv.effective_from<=v_period.period_end order by ecv.effective_from desc limit 1) cv on true
  where e.tenant_id=p_tenant_id and e.employment_date<=v_period.period_end and (e.termination_date is null or e.termination_date>=v_period.period_start);
  insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source)
  select p_tenant_id,pe.id,'BASE','本薪','earning',pe.gross_cents,'compensation_version' from public.payroll_entries pe where pe.payroll_period_id=p_period_id and pe.gross_cents>0;
  update public.payroll_periods set calculated_at=statement_timestamp(),calculated_by=(select auth.uid()) where id=p_period_id;
  get diagnostics v_count = row_count;
  select count(*) into v_count from public.payroll_entries where payroll_period_id=p_period_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values
  (p_tenant_id,(select auth.uid()),'payroll.draft_calculated','payroll_period',p_period_id::text,jsonb_build_object('employee_count',v_count));
  return v_count;
end $$;

create function public.add_payroll_adjustment(p_tenant_id uuid,p_entry_id uuid,p_kind public.payroll_item_kind,p_name text,p_amount_cents bigint,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_period_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  select pe.payroll_period_id into v_period_id from public.payroll_entries pe join public.payroll_periods pp on pp.id=pe.payroll_period_id where pe.tenant_id=p_tenant_id and pe.id=p_entry_id and pp.status='draft' for update of pp;
  if v_period_id is null or p_amount_cents<=0 or char_length(trim(p_name)) not between 1 and 40 then raise exception 'invalid draft adjustment' using errcode='22023'; end if;
  insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source,note,created_by)
  values(p_tenant_id,p_entry_id,'ADJUSTMENT',trim(p_name),p_kind,p_amount_cents,'manual',nullif(trim(p_note),''),(select auth.uid())) returning id into v_id;
  update public.payroll_entries pe set gross_cents=totals.gross,deduction_cents=totals.deductions,net_cents=totals.gross-totals.deductions
  from (select coalesce(sum(amount_cents) filter(where kind='earning'),0) gross,coalesce(sum(amount_cents) filter(where kind='deduction'),0) deductions from public.payroll_items where payroll_entry_id=p_entry_id) totals
  where pe.id=p_entry_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(p_tenant_id,(select auth.uid()),'payroll.adjustment_added','payroll_entry',p_entry_id::text,jsonb_build_object('item_id',v_id,'kind',p_kind,'amount_cents',p_amount_cents));
  return v_id;
end $$;

create function public.set_payroll_period_status(p_tenant_id uuid,p_period_id uuid,p_status public.payroll_period_status)
returns void language plpgsql security definer set search_path='' as $$
declare v_current public.payroll_period_status;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  select status into v_current from public.payroll_periods where tenant_id=p_tenant_id and id=p_period_id for update;
  if v_current is null then raise exception 'payroll period not found' using errcode='P0002'; end if;
  if not ((v_current='draft' and p_status='reviewed') or (v_current='reviewed' and p_status='locked') or (v_current='reviewed' and p_status='draft')) then raise exception 'invalid payroll status transition' using errcode='55000'; end if;
  if p_status in ('reviewed','locked') and exists(select 1 from public.payroll_entries where payroll_period_id=p_period_id and compensation_version_id is null) then raise exception 'employee compensation missing' using errcode='23514'; end if;
  update public.payroll_periods set status=p_status,reviewed_at=case when p_status='reviewed' then statement_timestamp() else reviewed_at end,reviewed_by=case when p_status='reviewed' then (select auth.uid()) else reviewed_by end,locked_at=case when p_status='locked' then statement_timestamp() else null end,locked_by=case when p_status='locked' then (select auth.uid()) else null end where id=p_period_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(p_tenant_id,(select auth.uid()),'payroll.status_changed','payroll_period',p_period_id::text,jsonb_build_object('from',v_current,'to',p_status));
end $$;

revoke all on function public.upsert_employee_compensation(uuid,uuid,date,bigint,text), public.create_payroll_period(uuid,date,date), public.calculate_payroll_draft(uuid,uuid), public.add_payroll_adjustment(uuid,uuid,public.payroll_item_kind,text,bigint,text), public.set_payroll_period_status(uuid,uuid,public.payroll_period_status) from public,anon,authenticated;
grant execute on function public.upsert_employee_compensation(uuid,uuid,date,bigint,text), public.create_payroll_period(uuid,date,date), public.calculate_payroll_draft(uuid,uuid), public.add_payroll_adjustment(uuid,uuid,public.payroll_item_kind,text,bigint,text), public.set_payroll_period_status(uuid,uuid,public.payroll_period_status) to authenticated;

commit;
