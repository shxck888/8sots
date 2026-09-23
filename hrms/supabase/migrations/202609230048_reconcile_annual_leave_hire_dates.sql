begin;

-- A corrected hire date must not leave grants calculated from the old date
-- available to the employee. Keep the original grant and audit trail intact.
create function public.annual_leave_grant_matches_hire_date(
  p_hire_date date, p_milestone_months integer, p_start date,
  p_end_exclusive date, p_days integer
)
returns boolean language sql immutable set search_path = '' as $$
  select p_hire_date is not null
    and (p_milestone_months = 6
      or (p_milestone_months >= 12 and p_milestone_months % 12 = 0))
    and p_start = case when p_milestone_months = 6
      then (p_hire_date + interval '6 months')::date
      else (p_hire_date + make_interval(years => p_milestone_months / 12))::date end
    and p_end_exclusive = case when p_milestone_months = 6
      then (p_hire_date + interval '1 year')::date
      else (p_hire_date + make_interval(years => p_milestone_months / 12 + 1))::date end
    and p_days = public.annual_leave_days_for_milestone(p_milestone_months)
$$;
revoke all on function public.annual_leave_grant_matches_hire_date(date,integer,date,date,integer)
  from public, anon, authenticated;

create view public.valid_annual_leave_grants as
select g.* from public.annual_leave_grants g
join public.employees e on e.tenant_id = g.tenant_id and e.id = g.employee_id
where public.annual_leave_grant_matches_hire_date(
  e.hire_date, g.service_milestone_months, g.period_start,
  g.period_end_exclusive, g.granted_days
);
revoke all on public.valid_annual_leave_grants from public, anon, authenticated;

-- Multiple historical grant calculations may share a service milestone when
-- a hire date is corrected. The start date distinguishes those versions.
alter table public.annual_leave_grants
  drop constraint annual_leave_grants_tenant_id_employee_id_service_milestone_key;
alter table public.annual_leave_grants
  add constraint annual_leave_grants_employee_milestone_start_key
  unique (tenant_id, employee_id, service_milestone_months, period_start);

-- Never silently invalidate an approved leave allocation or manual adjustment.
create function public.guard_hire_date_annual_leave_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.hire_date is distinct from new.hire_date and exists (
    select 1 from public.annual_leave_grants g
    where g.tenant_id = new.tenant_id and g.employee_id = new.id
      and not public.annual_leave_grant_matches_hire_date(
        new.hire_date, g.service_milestone_months, g.period_start,
        g.period_end_exclusive, g.granted_days)
      and (exists (select 1 from public.annual_leave_usages u where u.grant_id = g.id)
        or exists (select 1 from public.annual_leave_adjustments a where a.grant_id = g.id))
  ) then
    raise exception 'hire date change requires annual leave reconciliation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger employees_hire_date_annual_leave_history
  before update of hire_date on public.employees
  for each row execute function public.guard_hire_date_annual_leave_history();
revoke all on function public.guard_hire_date_annual_leave_history()
  from public, anon, authenticated;

do $migration$
declare
  v_definition text;
  v_signature text;
begin
  select pg_get_functiondef('public.sync_employee_annual_leave(uuid,uuid,date)'::regprocedure)
    into v_definition;
  if position('on conflict(tenant_id,employee_id,service_milestone_months)' in v_definition) = 0
    or position('from public.annual_leave_grants old' in v_definition) = 0 then
    raise exception 'annual leave sync definition changed unexpectedly';
  end if;
  v_definition := replace(v_definition,
    'on conflict(tenant_id,employee_id,service_milestone_months) do nothing',
    'on conflict(tenant_id,employee_id,service_milestone_months,period_start) do nothing');
  v_definition := replace(v_definition,
    'select id into v_grant_id from public.annual_leave_grants',
    'select id into v_grant_id from public.valid_annual_leave_grants');
  v_definition := replace(v_definition,
    'and service_milestone_months=v_milestone; end if;',
    'and service_milestone_months=v_milestone and period_start=v_start; end if;');
  v_definition := replace(v_definition,
    'from public.annual_leave_grants old', 'from public.valid_annual_leave_grants old');
  execute v_definition;

  select pg_get_functiondef('public.sync_annual_leave_grants(uuid,date)'::regprocedure)
    into v_definition;
  if position('select id into v_before from public.annual_leave_grants' in v_definition) = 0 then
    raise exception 'annual leave batch sync definition changed unexpectedly';
  end if;
  execute replace(v_definition,
    'select id into v_before from public.annual_leave_grants',
    'select id into v_before from public.valid_annual_leave_grants');

  select pg_get_functiondef('public.get_annual_leave_balance(uuid,uuid,date)'::regprocedure)
    into v_definition;
  if position('from public.annual_leave_grants g' in v_definition) = 0 then
    raise exception 'annual leave balance definition changed unexpectedly';
  end if;
  execute replace(v_definition,
    'from public.annual_leave_grants g', 'from public.valid_annual_leave_grants g');

  select pg_get_functiondef('public.allocate_approved_annual_leave()'::regprocedure)
    into v_definition;
  if position('from public.annual_leave_grants g' in v_definition) = 0 then
    raise exception 'annual leave allocation definition changed unexpectedly';
  end if;
  execute replace(v_definition,
    'from public.annual_leave_grants g', 'from public.valid_annual_leave_grants g');

  select pg_get_functiondef('public.add_annual_leave_adjustment(uuid,uuid,integer,text)'::regprocedure)
    into v_definition;
  if position('if v_grant.id is null then raise exception' in v_definition) = 0 then
    raise exception 'annual leave adjustment definition changed unexpectedly';
  end if;
  v_definition := replace(v_definition,
    'if v_grant.id is null then raise exception',
    'if v_grant.id is not null and not public.annual_leave_grant_matches_hire_date((select e.hire_date from public.employees e where e.tenant_id=p_tenant_id and e.id=v_grant.employee_id),v_grant.service_milestone_months,v_grant.period_start,v_grant.period_end_exclusive,v_grant.granted_days) then raise exception ''annual leave grant superseded by hire date'' using errcode=''23514''; end if; if v_grant.id is null then raise exception');
  execute v_definition;
end;
$migration$;

commit;
