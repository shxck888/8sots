begin;

create table public.payroll_statutory_rule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  effective_from date not null,
  labor_insurance_rate_ppm integer not null check (labor_insurance_rate_ppm between 0 and 1000000),
  labor_employee_share_ppm integer not null check (labor_employee_share_ppm between 0 and 1000000),
  employment_insurance_rate_ppm integer not null check (employment_insurance_rate_ppm between 0 and 1000000),
  employment_employee_share_ppm integer not null check (employment_employee_share_ppm between 0 and 1000000),
  health_insurance_rate_ppm integer not null check (health_insurance_rate_ppm between 0 and 1000000),
  health_employee_share_ppm integer not null check (health_employee_share_ppm between 0 and 1000000),
  pension_employer_rate_ppm integer not null check (pension_employer_rate_ppm between 0 and 1000000),
  monthly_hour_divisor integer not null check (monthly_hour_divisor between 1 and 744),
  overtime_tier_1_minutes integer not null check (overtime_tier_1_minutes between 0 and 480),
  overtime_tier_1_multiplier_ppm integer not null check (overtime_tier_1_multiplier_ppm between 1000000 and 5000000),
  overtime_tier_2_minutes integer not null check (overtime_tier_2_minutes between 0 and 480),
  overtime_tier_2_multiplier_ppm integer not null check (overtime_tier_2_multiplier_ppm between 1000000 and 5000000),
  overtime_tier_3_minutes integer not null check (overtime_tier_3_minutes between 0 and 480),
  overtime_tier_3_multiplier_ppm integer not null check (overtime_tier_3_multiplier_ppm between 1000000 and 5000000),
  source_note text not null check (char_length(trim(source_note)) between 5 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, effective_from)
);

create table public.employee_statutory_profile_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  employee_id uuid not null,
  effective_from date not null,
  labor_insured_salary_cents bigint not null check (labor_insured_salary_cents between 0 and 1000000000),
  employment_insured_salary_cents bigint not null check (employment_insured_salary_cents between 0 and 1000000000),
  health_insured_salary_cents bigint not null check (health_insured_salary_cents between 0 and 1000000000),
  health_dependent_count integer not null check (health_dependent_count between 0 and 3),
  pension_salary_cents bigint not null check (pension_salary_cents between 0 and 1000000000),
  pension_voluntary_rate_ppm integer not null check (pension_voluntary_rate_ppm between 0 and 60000),
  income_tax_withholding_cents bigint not null check (income_tax_withholding_cents between 0 and 1000000000),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, employee_id, effective_from),
  foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete restrict
);

create table public.leave_pay_rule_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  leave_type_id uuid not null,
  effective_from date not null,
  paid_ratio_ppm integer not null check (paid_ratio_ppm between 0 and 1000000),
  note text not null check (char_length(trim(note)) between 5 and 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, leave_type_id, effective_from),
  foreign key (tenant_id, leave_type_id) references public.leave_types(tenant_id, id) on delete restrict
);

create index payroll_statutory_rule_effective_idx on public.payroll_statutory_rule_versions (tenant_id, effective_from desc);
create index employee_statutory_profile_effective_idx on public.employee_statutory_profile_versions (tenant_id, employee_id, effective_from desc);
create index leave_pay_rule_effective_idx on public.leave_pay_rule_versions (tenant_id, leave_type_id, effective_from desc);

alter table public.payroll_periods
  add column statutory_rule_version_id uuid,
  add column statutory_settings_snapshot jsonb not null default '{}'::jsonb,
  add constraint payroll_period_statutory_rule_fk foreign key (tenant_id, statutory_rule_version_id)
    references public.payroll_statutory_rule_versions(tenant_id, id);
alter table public.payroll_entries
  add column statutory_profile_version_id uuid,
  add constraint payroll_entry_statutory_profile_fk foreign key (tenant_id, statutory_profile_version_id)
    references public.employee_statutory_profile_versions(tenant_id, id);

alter table public.payroll_statutory_rule_versions enable row level security;
alter table public.employee_statutory_profile_versions enable row level security;
alter table public.leave_pay_rule_versions enable row level security;
create policy payroll_statutory_rules_manager_read on public.payroll_statutory_rule_versions for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'payroll.manage'));
create policy employee_statutory_profiles_manager_read on public.employee_statutory_profile_versions for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'payroll.manage'));
create policy leave_pay_rules_manager_read on public.leave_pay_rule_versions for select to authenticated
  using (public.current_user_has_permission(tenant_id, 'payroll.manage'));
revoke all privileges on table public.payroll_statutory_rule_versions, public.employee_statutory_profile_versions, public.leave_pay_rule_versions from anon, authenticated;
grant select on table public.payroll_statutory_rule_versions, public.employee_statutory_profile_versions, public.leave_pay_rule_versions to authenticated;

create function public.guard_payroll_configuration_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'payroll configuration versions are immutable; create a new effective date' using errcode = '55000';
end $$;
create trigger payroll_statutory_rule_immutable before update or delete on public.payroll_statutory_rule_versions
  for each row execute function public.guard_payroll_configuration_version();
create trigger employee_statutory_profile_immutable before update or delete on public.employee_statutory_profile_versions
  for each row execute function public.guard_payroll_configuration_version();
create trigger leave_pay_rule_immutable before update or delete on public.leave_pay_rule_versions
  for each row execute function public.guard_payroll_configuration_version();

create function public.save_payroll_statutory_settings(
  p_tenant_id uuid, p_effective_from date,
  p_labor_insurance_rate_ppm integer, p_labor_employee_share_ppm integer,
  p_employment_insurance_rate_ppm integer, p_employment_employee_share_ppm integer,
  p_health_insurance_rate_ppm integer, p_health_employee_share_ppm integer,
  p_pension_employer_rate_ppm integer, p_monthly_hour_divisor integer,
  p_overtime_tier_1_minutes integer, p_overtime_tier_1_multiplier_ppm integer,
  p_overtime_tier_2_minutes integer, p_overtime_tier_2_multiplier_ppm integer,
  p_overtime_tier_3_minutes integer, p_overtime_tier_3_multiplier_ppm integer,
  p_source_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'payroll.manage') then
    raise exception 'payroll.manage permission required' using errcode = '42501';
  end if;
  if p_effective_from is null or p_source_note is null or char_length(trim(p_source_note)) not between 5 and 500
    or p_labor_insurance_rate_ppm not between 0 and 1000000 or p_labor_employee_share_ppm not between 0 and 1000000
    or p_employment_insurance_rate_ppm not between 0 and 1000000 or p_employment_employee_share_ppm not between 0 and 1000000
    or p_health_insurance_rate_ppm not between 0 and 1000000 or p_health_employee_share_ppm not between 0 and 1000000
    or p_pension_employer_rate_ppm not between 0 and 1000000 or p_monthly_hour_divisor not between 1 and 744
    or p_overtime_tier_1_minutes not between 0 and 480 or p_overtime_tier_2_minutes not between 0 and 480 or p_overtime_tier_3_minutes not between 0 and 480
    or p_overtime_tier_1_multiplier_ppm not between 1000000 and 5000000
    or p_overtime_tier_2_multiplier_ppm not between 1000000 and 5000000
    or p_overtime_tier_3_multiplier_ppm not between 1000000 and 5000000
  then raise exception 'invalid statutory payroll settings' using errcode = '22023'; end if;
  insert into public.payroll_statutory_rule_versions (
    tenant_id, effective_from, labor_insurance_rate_ppm, labor_employee_share_ppm,
    employment_insurance_rate_ppm, employment_employee_share_ppm,
    health_insurance_rate_ppm, health_employee_share_ppm, pension_employer_rate_ppm,
    monthly_hour_divisor, overtime_tier_1_minutes, overtime_tier_1_multiplier_ppm,
    overtime_tier_2_minutes, overtime_tier_2_multiplier_ppm,
    overtime_tier_3_minutes, overtime_tier_3_multiplier_ppm, source_note, created_by
  ) values (
    p_tenant_id, p_effective_from, p_labor_insurance_rate_ppm, p_labor_employee_share_ppm,
    p_employment_insurance_rate_ppm, p_employment_employee_share_ppm,
    p_health_insurance_rate_ppm, p_health_employee_share_ppm, p_pension_employer_rate_ppm,
    p_monthly_hour_divisor, p_overtime_tier_1_minutes, p_overtime_tier_1_multiplier_ppm,
    p_overtime_tier_2_minutes, p_overtime_tier_2_multiplier_ppm,
    p_overtime_tier_3_minutes, p_overtime_tier_3_multiplier_ppm, trim(p_source_note), auth.uid()
  ) returning id into v_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, auth.uid(), 'settings.payroll_statutory_created', 'payroll_statutory_rule_version', v_id::text,
    jsonb_build_object('effective_from', p_effective_from));
  return v_id;
end $$;

create function public.save_employee_statutory_profile(
  p_tenant_id uuid, p_employee_id uuid, p_effective_from date,
  p_labor_insured_salary_cents bigint, p_employment_insured_salary_cents bigint,
  p_health_insured_salary_cents bigint, p_health_dependent_count integer,
  p_pension_salary_cents bigint, p_pension_voluntary_rate_ppm integer,
  p_income_tax_withholding_cents bigint, p_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'payroll.manage') then
    raise exception 'payroll.manage permission required' using errcode = '42501';
  end if;
  if p_effective_from is null or p_labor_insured_salary_cents not between 0 and 1000000000
    or p_employment_insured_salary_cents not between 0 and 1000000000
    or p_health_insured_salary_cents not between 0 and 1000000000
    or p_health_dependent_count not between 0 and 3 or p_pension_salary_cents not between 0 and 1000000000
    or p_pension_voluntary_rate_ppm not between 0 and 60000 or p_income_tax_withholding_cents not between 0 and 1000000000
    or (p_note is not null and char_length(p_note) > 500)
  then raise exception 'invalid employee statutory profile' using errcode = '22023'; end if;
  if not exists (select 1 from public.employees where tenant_id = p_tenant_id and id = p_employee_id) then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;
  insert into public.employee_statutory_profile_versions (
    tenant_id, employee_id, effective_from, labor_insured_salary_cents,
    employment_insured_salary_cents, health_insured_salary_cents, health_dependent_count,
    pension_salary_cents, pension_voluntary_rate_ppm, income_tax_withholding_cents, note, created_by
  ) values (
    p_tenant_id, p_employee_id, p_effective_from, p_labor_insured_salary_cents,
    p_employment_insured_salary_cents, p_health_insured_salary_cents, p_health_dependent_count,
    p_pension_salary_cents, p_pension_voluntary_rate_ppm, p_income_tax_withholding_cents,
    nullif(trim(p_note), ''), auth.uid()
  ) returning id into v_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, auth.uid(), 'payroll.statutory_profile_created', 'employee_statutory_profile', v_id::text,
    jsonb_build_object('employee_id', p_employee_id, 'effective_from', p_effective_from));
  return v_id;
end $$;

create function public.save_leave_pay_rule(
  p_tenant_id uuid, p_leave_type_id uuid, p_effective_from date, p_paid_ratio_ppm integer, p_note text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id, 'payroll.manage') then
    raise exception 'payroll.manage permission required' using errcode = '42501';
  end if;
  if p_effective_from is null or p_paid_ratio_ppm not between 0 and 1000000
    or p_note is null or char_length(trim(p_note)) not between 5 and 500
  then raise exception 'invalid leave pay rule' using errcode = '22023'; end if;
  if not exists (select 1 from public.leave_types where tenant_id = p_tenant_id and id = p_leave_type_id) then
    raise exception 'leave type not found' using errcode = 'P0002';
  end if;
  insert into public.leave_pay_rule_versions(tenant_id, leave_type_id, effective_from, paid_ratio_ppm, note, created_by)
  values (p_tenant_id, p_leave_type_id, p_effective_from, p_paid_ratio_ppm, trim(p_note), auth.uid())
  returning id into v_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (p_tenant_id, auth.uid(), 'payroll.leave_pay_rule_created', 'leave_pay_rule', v_id::text,
    jsonb_build_object('leave_type_id', p_leave_type_id, 'effective_from', p_effective_from, 'paid_ratio_ppm', p_paid_ratio_ppm));
  return v_id;
end $$;

create function public.payroll_prorated_cents(p_hourly_cents bigint, p_minutes integer, p_multiplier_ppm integer)
returns bigint language sql immutable set search_path = '' as $$
  select round(coalesce(p_hourly_cents, 0)::numeric * coalesce(p_minutes, 0)::numeric / 60
    * coalesce(p_multiplier_ppm, 0)::numeric / 1000000)::bigint
$$;

create function public.payroll_premium_cents(p_insured_cents bigint, p_rate_ppm integer, p_share_ppm integer)
returns bigint language sql immutable set search_path = '' as $$
  select round(coalesce(p_insured_cents, 0)::numeric * coalesce(p_rate_ppm, 0)::numeric
    * coalesce(p_share_ppm, 0)::numeric / 1000000000000 / 100)::bigint * 100
$$;

create or replace function public.calculate_payroll_draft(p_tenant_id uuid, p_period_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_period public.payroll_periods%rowtype; v_rule public.payroll_statutory_rule_versions%rowtype;
  v_count integer; v_employee record; v_cv public.employee_compensation_versions%rowtype;
  v_profile public.employee_statutory_profile_versions%rowtype; v_entry uuid; v_base bigint;
  v_hourly bigint; v_attendance jsonb; v_blockers jsonb; v_leave_snapshot jsonb;
  v_request record; v_leave_rule public.leave_pay_rule_versions%rowtype;
  v_leave_amount bigint; v_overtime_amount bigint; v_request_amount bigint; v_remaining integer;
  v_tier_minutes integer; v_labor bigint; v_employment bigint; v_health_unit bigint;
  v_health bigint; v_pension bigint; v_employer_pension bigint;
begin
  if not public.current_user_has_permission(p_tenant_id, 'payroll.manage') then
    raise exception 'payroll.manage permission required' using errcode = '42501';
  end if;
  select * into v_period from public.payroll_periods where tenant_id = p_tenant_id and id = p_period_id for update;
  if v_period.id is null then raise exception 'payroll period not found' using errcode = 'P0002'; end if;
  if v_period.status <> 'draft' then raise exception 'only draft payroll can be recalculated' using errcode = '55000'; end if;
  select * into v_rule from public.payroll_statutory_rule_versions
    where tenant_id = p_tenant_id and effective_from <= v_period.period_end
    order by effective_from desc, created_at desc, id desc limit 1;
  update public.payroll_periods set statutory_rule_version_id = v_rule.id,
    statutory_settings_snapshot = case when v_rule.id is null then '{}'::jsonb else to_jsonb(v_rule) end
    where id = p_period_id;

  for v_employee in
    select e.*, er.termination_date from public.employees e left join lateral (
      select r.termination_date from public.employment_records r where r.tenant_id = e.tenant_id and r.employee_id = e.id
      and r.effective_from <= v_period.period_end order by r.effective_from desc, r.created_at desc, r.id desc limit 1
    ) er on true where e.tenant_id = p_tenant_id and e.hire_date <= v_period.period_end
      and (er.termination_date is null or er.termination_date >= v_period.period_start)
  loop
    v_blockers := '[]'::jsonb; v_leave_snapshot := '[]'::jsonb;
    v_leave_amount := 0; v_overtime_amount := 0;
    select * into v_cv from public.employee_compensation_versions where tenant_id = p_tenant_id and employee_id = v_employee.id
      and effective_from <= v_period.period_end order by effective_from desc, created_at desc, id desc limit 1;
    select * into v_profile from public.employee_statutory_profile_versions where tenant_id = p_tenant_id and employee_id = v_employee.id
      and effective_from <= v_period.period_end order by effective_from desc, created_at desc, id desc limit 1;
    if v_rule.id is null then v_blockers := v_blockers || jsonb_build_array('缺少本期生效的法定扣款與加班規則'); end if;
    if v_cv.id is null then v_blockers := v_blockers || jsonb_build_array('缺少本期生效的薪資版本'); end if;
    if v_profile.id is null then v_blockers := v_blockers || jsonb_build_array('缺少本期生效的員工投保與扣繳資料'); end if;

    select jsonb_build_object('days', coalesce(jsonb_agg(to_jsonb(d) order by d.work_date), '[]'::jsonb),
      'actual_minutes', coalesce(sum(d.actual_minutes), 0), 'scheduled_minutes', coalesce(sum(d.scheduled_minutes), 0),
      'approved_leave_minutes', coalesce(sum(d.approved_leave_minutes), 0), 'approved_overtime_minutes', coalesce(sum(d.approved_overtime_minutes), 0),
      'exception_count', coalesce(sum(d.exception_count), 0)) into v_attendance
    from (select distinct on (ad.work_date) ad.* from public.attendance_days ad
      join public.attendance_calculation_runs cr on cr.id = ad.calculation_run_id
      where ad.tenant_id = p_tenant_id and ad.employee_id = v_employee.id
        and ad.work_date between v_period.period_start and v_period.period_end
      order by ad.work_date, cr.calculated_at desc, ad.created_at desc, ad.id desc) d;

    v_hourly := case when v_cv.pay_basis = 'hourly' then coalesce(v_cv.hourly_rate_cents, 0)
      when v_rule.id is not null then round(coalesce(v_cv.monthly_base_cents, 0)::numeric / v_rule.monthly_hour_divisor)::bigint
      else 0 end;
    v_base := case when v_cv.pay_basis = 'hourly'
      then public.payroll_prorated_cents(v_hourly, (v_attendance->>'actual_minutes')::integer, 1000000)
      else coalesce(v_cv.monthly_base_cents, 0) end;

    for v_request in
      select wr.*, lt.name leave_type_name from public.work_requests wr
      join public.work_request_decisions wd on wd.tenant_id = wr.tenant_id and wd.work_request_id = wr.id and wd.decision = 'approved'
      left join public.leave_types lt on lt.tenant_id = wr.tenant_id and lt.id = wr.leave_type_id
      where wr.tenant_id = p_tenant_id and wr.employee_id = v_employee.id
        and (wr.starts_at at time zone wr.timezone)::date between v_period.period_start and v_period.period_end
        and not exists (select 1 from public.work_request_withdrawals ww where ww.work_request_id = wr.id)
      order by wr.starts_at, wr.id
    loop
      if v_request.request_type = 'leave' then
        select * into v_leave_rule from public.leave_pay_rule_versions where tenant_id = p_tenant_id
          and leave_type_id = v_request.leave_type_id
          and effective_from <= (v_request.starts_at at time zone v_request.timezone)::date
          order by effective_from desc, created_at desc, id desc limit 1;
        if v_leave_rule.id is null then
          v_blockers := v_blockers || jsonb_build_array('假別「' || coalesce(v_request.leave_type_name, '未命名') || '」缺少薪資比例');
        else
          v_request_amount := public.payroll_prorated_cents(v_hourly, v_request.requested_minutes,
            case when v_cv.pay_basis = 'monthly' then 1000000 - v_leave_rule.paid_ratio_ppm else v_leave_rule.paid_ratio_ppm end);
          v_leave_amount := v_leave_amount + v_request_amount;
          v_leave_snapshot := v_leave_snapshot || jsonb_build_array(jsonb_build_object(
            'request_id', v_request.id, 'leave_type', v_request.leave_type_name,
            'minutes', v_request.requested_minutes, 'paid_ratio_ppm', v_leave_rule.paid_ratio_ppm,
            'rule_version_id', v_leave_rule.id, 'amount_cents', v_request_amount));
        end if;
      elsif v_rule.id is not null then
        v_remaining := v_request.requested_minutes; v_request_amount := 0;
        v_tier_minutes := least(v_remaining, v_rule.overtime_tier_1_minutes);
        v_request_amount := v_request_amount + public.payroll_prorated_cents(v_hourly, v_tier_minutes, v_rule.overtime_tier_1_multiplier_ppm);
        v_remaining := v_remaining - v_tier_minutes;
        v_tier_minutes := least(v_remaining, v_rule.overtime_tier_2_minutes);
        v_request_amount := v_request_amount + public.payroll_prorated_cents(v_hourly, v_tier_minutes, v_rule.overtime_tier_2_multiplier_ppm);
        v_remaining := v_remaining - v_tier_minutes;
        v_tier_minutes := least(v_remaining, v_rule.overtime_tier_3_minutes);
        v_request_amount := v_request_amount + public.payroll_prorated_cents(v_hourly, v_tier_minutes, v_rule.overtime_tier_3_multiplier_ppm);
        v_remaining := v_remaining - v_tier_minutes;
        if v_remaining > 0 then
          v_blockers := v_blockers || jsonb_build_array('加班申請 ' || v_request.id::text || ' 超過已設定的自動計薪級距');
        end if;
        v_overtime_amount := v_overtime_amount + v_request_amount;
      end if;
    end loop;

    v_labor := case when v_profile.id is null or v_rule.id is null then 0 else public.payroll_premium_cents(v_profile.labor_insured_salary_cents, v_rule.labor_insurance_rate_ppm, v_rule.labor_employee_share_ppm) end;
    v_employment := case when v_profile.id is null or v_rule.id is null then 0 else public.payroll_premium_cents(v_profile.employment_insured_salary_cents, v_rule.employment_insurance_rate_ppm, v_rule.employment_employee_share_ppm) end;
    v_health_unit := case when v_profile.id is null or v_rule.id is null then 0 else public.payroll_premium_cents(v_profile.health_insured_salary_cents, v_rule.health_insurance_rate_ppm, v_rule.health_employee_share_ppm) end;
    v_health := v_health_unit * case when v_profile.id is null then 1 else 1 + v_profile.health_dependent_count end;
    v_pension := case when v_profile.id is null then 0 else round(v_profile.pension_salary_cents::numeric * v_profile.pension_voluntary_rate_ppm / 1000000 / 100)::bigint * 100 end;
    v_employer_pension := case when v_profile.id is null or v_rule.id is null then 0 else round(v_profile.pension_salary_cents::numeric * v_rule.pension_employer_rate_ppm / 1000000 / 100)::bigint * 100 end;

    insert into public.payroll_entries(tenant_id, payroll_period_id, employee_id, compensation_version_id, statutory_profile_version_id, source_snapshot)
    values (p_tenant_id, p_period_id, v_employee.id, v_cv.id, v_profile.id, jsonb_build_object(
      'employee_no', v_employee.employee_no, 'employee_name', v_employee.full_name,
      'hire_date', v_employee.hire_date, 'termination_date', v_employee.termination_date,
      'compensation', to_jsonb(v_cv), 'statutory_profile', to_jsonb(v_profile), 'attendance', v_attendance,
      'approved_leave_pay', v_leave_snapshot, 'approved_overtime_amount_cents', v_overtime_amount,
      'employer_pension_amount_cents', v_employer_pension,
      'period_start', v_period.period_start, 'period_end', v_period.period_end,
      'rule_version_id', v_period.rule_version_id, 'statutory_rule_version_id', v_rule.id,
      'payroll_blockers', v_blockers, 'manual_review_required', jsonb_array_length(v_blockers) > 0
        or v_employee.hire_date > v_period.period_start
        or coalesce(v_employee.termination_date < v_period.period_end, false)
        or (v_cv.id is not null and v_cv.effective_from > v_period.period_start)
        or (v_profile.id is not null and v_profile.effective_from > v_period.period_start),
      'automatic_deductions_applied', v_profile.id is not null and v_rule.id is not null,
      'insurance_tax_applied', v_profile.id is not null and v_rule.id is not null,
      'partial_period', v_employee.hire_date > v_period.period_start
        or coalesce(v_employee.termination_date < v_period.period_end, false)
        or (v_cv.id is not null and v_cv.effective_from > v_period.period_start)))
    on conflict (payroll_period_id, employee_id) do update set
      compensation_version_id = excluded.compensation_version_id,
      statutory_profile_version_id = excluded.statutory_profile_version_id,
      source_snapshot = excluded.source_snapshot
    returning id into v_entry;

    delete from public.payroll_items where payroll_entry_id = v_entry and source in ('compensation_version', 'work_request', 'statutory');
    insert into public.payroll_items(tenant_id, payroll_entry_id, code, name, kind, amount_cents, source)
      values (p_tenant_id, v_entry, 'BASE', case when v_cv.pay_basis = 'hourly' then '時薪 × 已計算出勤分鐘' else '本薪' end, 'earning', v_base, 'compensation_version');
    if v_overtime_amount > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source)
      values(p_tenant_id,v_entry,'OVERTIME','核准加班費','earning',v_overtime_amount,'work_request'); end if;
    if v_leave_amount > 0 and v_cv.pay_basis = 'monthly' then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source)
      values(p_tenant_id,v_entry,'UNPAID_LEAVE','請假未給薪扣款','deduction',v_leave_amount,'work_request');
    elsif v_leave_amount > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source)
      values(p_tenant_id,v_entry,'PAID_LEAVE','核准有薪請假','earning',v_leave_amount,'work_request'); end if;
    if v_labor > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source) values(p_tenant_id,v_entry,'LABOR_INSURANCE','勞工保險費','deduction',v_labor,'statutory'); end if;
    if v_employment > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source) values(p_tenant_id,v_entry,'EMPLOYMENT_INSURANCE','就業保險費','deduction',v_employment,'statutory'); end if;
    if v_health > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source) values(p_tenant_id,v_entry,'HEALTH_INSURANCE','全民健康保險費','deduction',v_health,'statutory'); end if;
    if v_pension > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source) values(p_tenant_id,v_entry,'PENSION_VOLUNTARY','勞工退休金自提','deduction',v_pension,'statutory'); end if;
    if v_profile.income_tax_withholding_cents > 0 then insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source) values(p_tenant_id,v_entry,'INCOME_TAX','薪資所得扣繳','deduction',v_profile.income_tax_withholding_cents,'statutory'); end if;
    update public.payroll_entries pe set gross_cents = t.gross, deduction_cents = t.deduct, net_cents = t.gross - t.deduct from
      (select coalesce(sum(amount_cents) filter(where kind = 'earning'), 0) gross,
        coalesce(sum(amount_cents) filter(where kind = 'deduction'), 0) deduct
       from public.payroll_items where payroll_entry_id = v_entry) t where pe.id = v_entry;
  end loop;
  update public.payroll_periods set calculated_at = clock_timestamp(), calculated_by = auth.uid(),
    review_note = null, reviewed_at = null, reviewed_by = null where id = p_period_id;
  select count(*) into v_count from public.payroll_entries where payroll_period_id = p_period_id;
  insert into public.audit_logs(tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values(p_tenant_id, auth.uid(), 'payroll.draft_calculated', 'payroll_period', p_period_id::text,
    jsonb_build_object('employee_count', v_count, 'statutory_rule_version_id', v_rule.id, 'manual_adjustments_preserved', true));
  return v_count;
end $$;

create or replace function public.set_payroll_period_status(p_tenant_id uuid,p_period_id uuid,p_status public.payroll_period_status)
returns void language plpgsql security definer set search_path='' as $$
declare v_period public.payroll_periods%rowtype;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  select * into v_period from public.payroll_periods where tenant_id=p_tenant_id and id=p_period_id for update;
  if v_period.id is null then raise exception 'payroll period not found' using errcode='P0002'; end if;
  if p_status is null or not((v_period.status='draft' and p_status='reviewed') or (v_period.status='reviewed' and p_status in ('draft','locked'))) then raise exception 'invalid payroll status transition' using errcode='55000'; end if;
  if p_status in ('reviewed','locked') then
    if v_period.calculated_at is null or v_period.rule_version_id is null or v_period.statutory_rule_version_id is null or v_period.pay_date is null
      or coalesce(char_length(trim(v_period.review_note)),0)<10
      or not exists(select 1 from public.payroll_entries where payroll_period_id=p_period_id)
      then raise exception 'calculation, settings and explicit review required' using errcode='23514'; end if;
    if exists(select 1 from public.payroll_entries where payroll_period_id=p_period_id and (
      compensation_version_id is null or statutory_profile_version_id is null or net_cents<0
      or jsonb_array_length(coalesce(source_snapshot->'payroll_blockers','[]'::jsonb)) > 0
    )) then raise exception 'payroll has unresolved blockers' using errcode='23514'; end if;
  end if;
  update public.payroll_periods set status=p_status,
    reviewed_at=case when p_status='draft' then null when p_status='reviewed' then clock_timestamp() else reviewed_at end,
    reviewed_by=case when p_status='draft' then null when p_status='reviewed' then auth.uid() else reviewed_by end,
    review_note=case when p_status='draft' then null else review_note end,
    locked_at=case when p_status='locked' then clock_timestamp() else null end,
    locked_by=case when p_status='locked' then auth.uid() else null end where id=p_period_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'payroll.status_changed','payroll_period',p_period_id::text,jsonb_build_object('from',v_period.status,'to',p_status,'review_note',v_period.review_note));
end $$;

revoke all on function public.guard_payroll_configuration_version(),
  public.save_payroll_statutory_settings(uuid,date,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text),
  public.save_employee_statutory_profile(uuid,uuid,date,bigint,bigint,bigint,integer,bigint,integer,bigint,text),
  public.save_leave_pay_rule(uuid,uuid,date,integer,text),
  public.payroll_prorated_cents(bigint,integer,integer), public.payroll_premium_cents(bigint,integer,integer) from public, anon, authenticated;
grant execute on function
  public.save_payroll_statutory_settings(uuid,date,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,text),
  public.save_employee_statutory_profile(uuid,uuid,date,bigint,bigint,bigint,integer,bigint,integer,bigint,text),
  public.save_leave_pay_rule(uuid,uuid,date,integer,text) to authenticated;

commit;
