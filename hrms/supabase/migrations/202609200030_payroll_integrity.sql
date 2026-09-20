begin;

alter table public.employee_compensation_versions add column pay_basis text not null default 'monthly' check(pay_basis in ('monthly','hourly')),
  add column hourly_rate_cents bigint not null default 0 check(hourly_rate_cents>=0);
alter table public.payroll_periods add column rule_version_id uuid,
  add column settings_snapshot jsonb not null default '{}'::jsonb,
  add column review_note text,
  add constraint payroll_period_rule_fk foreign key(tenant_id,rule_version_id) references public.payroll_rule_versions(tenant_id,id);
alter table public.payroll_items add column idempotency_key uuid;
create unique index payroll_item_retry_idx on public.payroll_items(tenant_id,idempotency_key) where idempotency_key is not null;

-- SECURITY DEFINER breaks the period -> entry -> period RLS recursion. Identity
-- and active membership are checked inside the helper; caller cannot supply a user.
create function public.can_read_locked_payroll(p_tenant_id uuid,p_period_id uuid,p_employee_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.payroll_periods pp
join public.payroll_entries pe on pe.tenant_id=pp.tenant_id and pe.payroll_period_id=pp.id
join public.employees e on e.tenant_id=pe.tenant_id and e.id=pe.employee_id
join public.tenant_memberships tm on tm.tenant_id=e.tenant_id and tm.user_id=e.auth_user_id and tm.status='active'
where pp.tenant_id=p_tenant_id and pp.id=p_period_id and pp.status='locked'
and e.auth_user_id=auth.uid() and (p_employee_id is null or e.id=p_employee_id));
$$;
drop policy payroll_periods_manager_or_locked_self on public.payroll_periods;
drop policy payroll_entries_manager_or_locked_self on public.payroll_entries;
create policy payroll_periods_manager_or_locked_self on public.payroll_periods for select to authenticated using(
public.current_user_has_permission(tenant_id,'payroll.manage') or public.can_read_locked_payroll(tenant_id,id));
create policy payroll_entries_manager_or_locked_self on public.payroll_entries for select to authenticated using(
public.current_user_has_permission(tenant_id,'payroll.manage') or public.can_read_locked_payroll(tenant_id,payroll_period_id,employee_id));

create function public.guard_payroll_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_period uuid;
begin
  if tg_table_name in ('employee_compensation_versions','payroll_rule_versions','workplace_setting_versions') then
    raise exception 'settings versions are immutable; create a new effective date' using errcode='55000';
  elsif tg_table_name='payroll_periods' then
    if old.status='locked' then raise exception 'locked payroll is immutable' using errcode='55000'; end if;
  else
    if tg_table_name='payroll_entries' then v_period:=case when tg_op='INSERT' then new.payroll_period_id else old.payroll_period_id end;
    else select payroll_period_id into v_period from public.payroll_entries where id=case when tg_op='INSERT' then new.payroll_entry_id else old.payroll_entry_id end; end if;
    perform 1 from public.payroll_periods where id=v_period and status='draft' for update;
    if not found then raise exception 'only draft payroll is mutable' using errcode='55000'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger compensation_immutable before update or delete on public.employee_compensation_versions for each row execute function public.guard_payroll_history();
create trigger payroll_rules_immutable before update or delete on public.payroll_rule_versions for each row execute function public.guard_payroll_history();
create trigger workplace_settings_immutable before update or delete on public.workplace_setting_versions for each row execute function public.guard_payroll_history();
create trigger payroll_period_locked before update or delete on public.payroll_periods for each row execute function public.guard_payroll_history();
create trigger payroll_entries_locked before insert or update or delete on public.payroll_entries for each row execute function public.guard_payroll_history();
create trigger payroll_items_locked before insert or update or delete on public.payroll_items for each row execute function public.guard_payroll_history();

create function public.save_employee_compensation(p_tenant_id uuid,p_employee_id uuid,p_effective_from date,p_pay_basis text,p_rate_cents bigint,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  if p_effective_from is null or p_rate_cents is null or p_rate_cents not between 0 and 1000000000
    or p_pay_basis is null or p_pay_basis not in ('monthly','hourly') then raise exception 'invalid compensation' using errcode='22023'; end if;
  insert into public.employee_compensation_versions(tenant_id,employee_id,effective_from,monthly_base_cents,pay_basis,hourly_rate_cents,note,created_by)
  values(p_tenant_id,p_employee_id,p_effective_from,case when p_pay_basis='monthly' then p_rate_cents else 0 end,p_pay_basis,case when p_pay_basis='hourly' then p_rate_cents else 0 end,nullif(trim(p_note),''),auth.uid()) returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'payroll.compensation_created','employee_compensation',v_id::text,jsonb_build_object('employee_id',p_employee_id,'effective_from',p_effective_from,'pay_basis',p_pay_basis,'rate_cents',p_rate_cents));
  return v_id;
end $$;
create or replace function public.upsert_employee_compensation(p_tenant_id uuid,p_employee_id uuid,p_effective_from date,p_monthly_base_cents bigint,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
begin return public.save_employee_compensation(p_tenant_id,p_employee_id,p_effective_from,'monthly',p_monthly_base_cents,p_note); end $$;

create or replace function public.create_payroll_period(p_tenant_id uuid,p_period_month date,p_pay_date date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_month date:=date_trunc('month',p_period_month)::date; v_rule public.payroll_rule_versions%rowtype;
v_start date; v_end date; v_pay date; v_pay_month date; v_close integer; v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  if p_period_month is null then raise exception 'month required' using errcode='22023'; end if;
  select * into v_rule from public.payroll_rule_versions where tenant_id=p_tenant_id and effective_from<=v_month order by effective_from desc,version desc limit 1;
  if v_rule.id is null or not(v_rule.rules ?& array['closing_day','pay_day','pay_month_offset','default_basis']) then raise exception 'payroll settings missing' using errcode='23514'; end if;
  v_close:=(v_rule.rules->>'closing_day')::integer;
  v_end:=least((v_month+interval '1 month'-interval '1 day')::date,v_month+v_close-1);
  v_start:=least(v_month-1,(v_month-interval '1 month')::date+v_close-1)+1;
  v_pay_month:=(v_month+make_interval(months=>(v_rule.rules->>'pay_month_offset')::integer))::date;
  v_pay:=coalesce(p_pay_date,least((v_pay_month+interval '1 month'-interval '1 day')::date,v_pay_month+(v_rule.rules->>'pay_day')::integer-1));
  if v_pay<v_end then raise exception 'pay date precedes period end' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':payroll-period',0));
  if exists(select 1 from public.payroll_periods where tenant_id=p_tenant_id and period_start<=v_end and period_end>=v_start) then raise exception 'payroll periods overlap' using errcode='23505'; end if;
  insert into public.payroll_periods(tenant_id,period_month,period_start,period_end,pay_date,rule_version_id,settings_snapshot)
  values(p_tenant_id,v_month,v_start,v_end,v_pay,v_rule.id,v_rule.rules) returning id into v_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'payroll.period_created','payroll_period',v_id::text,jsonb_build_object('start',v_start,'end',v_end,'pay_date',v_pay,'rule_version_id',v_rule.id));
  return v_id;
end $$;

create or replace function public.calculate_payroll_draft(p_tenant_id uuid,p_period_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_period public.payroll_periods%rowtype; v_count integer; v_employee record;
v_cv public.employee_compensation_versions%rowtype; v_entry uuid; v_base bigint; v_attendance jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  select * into v_period from public.payroll_periods where tenant_id=p_tenant_id and id=p_period_id for update;
  if v_period.id is null then raise exception 'payroll period not found' using errcode='P0002'; end if;
  if v_period.status<>'draft' then raise exception 'only draft payroll can be recalculated' using errcode='55000'; end if;
  -- Entries and manual adjustments retain stable IDs on recalculation.
  for v_employee in
    select e.*,er.termination_date from public.employees e left join lateral (
      select r.termination_date from public.employment_records r where r.tenant_id=e.tenant_id and r.employee_id=e.id
      and r.effective_from<=v_period.period_end order by r.effective_from desc,r.created_at desc,r.id desc limit 1
    ) er on true where e.tenant_id=p_tenant_id and e.hire_date<=v_period.period_end
      and (er.termination_date is null or er.termination_date>=v_period.period_start)
  loop
    select * into v_cv from public.employee_compensation_versions where tenant_id=p_tenant_id and employee_id=v_employee.id
      and effective_from<=v_period.period_end order by effective_from desc,created_at desc,id desc limit 1;
    select jsonb_build_object('days',coalesce(jsonb_agg(to_jsonb(d) order by d.work_date),'[]'::jsonb),
      'actual_minutes',coalesce(sum(d.actual_minutes),0),'scheduled_minutes',coalesce(sum(d.scheduled_minutes),0),
      'approved_leave_minutes',coalesce(sum(d.approved_leave_minutes),0),'approved_overtime_minutes',coalesce(sum(d.approved_overtime_minutes),0),
      'exception_count',coalesce(sum(d.exception_count),0)) into v_attendance
    from (select distinct on(ad.work_date) ad.* from public.attendance_days ad join public.attendance_calculation_runs cr on cr.id=ad.calculation_run_id
      where ad.tenant_id=p_tenant_id and ad.employee_id=v_employee.id and ad.work_date between v_period.period_start and v_period.period_end
      order by ad.work_date,cr.calculated_at desc,ad.created_at desc,ad.id desc) d;
    v_base:=case when v_cv.pay_basis='hourly' then round(v_cv.hourly_rate_cents::numeric*(v_attendance->>'actual_minutes')::numeric/60)::bigint else coalesce(v_cv.monthly_base_cents,0) end;
    insert into public.payroll_entries(tenant_id,payroll_period_id,employee_id,compensation_version_id,source_snapshot)
    values(p_tenant_id,p_period_id,v_employee.id,v_cv.id,jsonb_build_object('employee_no',v_employee.employee_no,'employee_name',v_employee.full_name,
      'hire_date',v_employee.hire_date,'termination_date',v_employee.termination_date,'compensation',to_jsonb(v_cv),'attendance',v_attendance,
      'period_start',v_period.period_start,'period_end',v_period.period_end,'rule_version_id',v_period.rule_version_id,
      'manual_review_required',true,'automatic_deductions_applied',false,'insurance_tax_applied',false,
      'partial_period',v_employee.hire_date>v_period.period_start or coalesce(v_employee.termination_date<v_period.period_end,false) or v_cv.effective_from>v_period.period_start))
    on conflict(payroll_period_id,employee_id) do update set compensation_version_id=excluded.compensation_version_id,source_snapshot=excluded.source_snapshot returning id into v_entry;
    delete from public.payroll_items where payroll_entry_id=v_entry and source='compensation_version';
    insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source)
    values(p_tenant_id,v_entry,'BASE',case when v_cv.pay_basis='hourly' then '時薪 × 已計算出勤分鐘（待核對）' else '本薪（待核對）' end,'earning',v_base,'compensation_version');
    update public.payroll_entries pe set gross_cents=t.gross,deduction_cents=t.deduct,net_cents=t.gross-t.deduct from
      (select coalesce(sum(amount_cents) filter(where kind='earning'),0) gross,coalesce(sum(amount_cents) filter(where kind='deduction'),0) deduct from public.payroll_items where payroll_entry_id=v_entry) t where pe.id=v_entry;
  end loop;
  update public.payroll_periods set calculated_at=clock_timestamp(),calculated_by=auth.uid(),review_note=null,reviewed_at=null,reviewed_by=null where id=p_period_id;
  select count(*) into v_count from public.payroll_entries where payroll_period_id=p_period_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'payroll.draft_calculated','payroll_period',p_period_id::text,jsonb_build_object('employee_count',v_count,'manual_adjustments_preserved',true));
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
    if v_period.calculated_at is null or v_period.rule_version_id is null or v_period.pay_date is null
      or coalesce(char_length(trim(v_period.review_note)),0)<10
      or not exists(select 1 from public.payroll_entries where payroll_period_id=p_period_id)
      then raise exception 'calculation, settings and explicit review required' using errcode='23514'; end if;
    if exists(select 1 from public.payroll_entries where payroll_period_id=p_period_id and (compensation_version_id is null or net_cents<0)) then raise exception 'employee compensation missing or negative net pay' using errcode='23514'; end if;
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

create function public.review_payroll_period(p_tenant_id uuid,p_period_id uuid,p_review_note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  if p_review_note is null or char_length(trim(p_review_note)) not between 10 and 1000 then raise exception 'review note required' using errcode='22023'; end if;
  update public.payroll_periods set review_note=trim(p_review_note) where tenant_id=p_tenant_id and id=p_period_id and status='draft';
  if not found then raise exception 'draft not found' using errcode='55000'; end if;
  perform public.set_payroll_period_status(p_tenant_id,p_period_id,'reviewed');
end $$;

-- Harden the legacy endpoint too; do not leave a permissive back door.
create or replace function public.add_payroll_adjustment(p_tenant_id uuid,p_entry_id uuid,p_kind public.payroll_item_kind,p_name text,p_amount_cents bigint,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_period uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  select pp.id into v_period from public.payroll_periods pp join public.payroll_entries pe on pe.payroll_period_id=pp.id
  where pp.tenant_id=p_tenant_id and pe.id=p_entry_id and pp.status='draft' for update of pp;
  if v_period is null or p_kind is null or p_amount_cents is null or p_amount_cents not between 1 and 1000000000
    or p_name is null or char_length(trim(p_name)) not between 1 and 40 then raise exception 'invalid draft adjustment' using errcode='22023'; end if;
  insert into public.payroll_items(tenant_id,payroll_entry_id,code,name,kind,amount_cents,source,note,created_by)
  values(p_tenant_id,p_entry_id,'ADJUSTMENT',trim(p_name),p_kind,p_amount_cents,'manual',nullif(trim(p_note),''),auth.uid()) returning id into v_id;
  update public.payroll_entries pe set gross_cents=t.gross,deduction_cents=t.deduct,net_cents=t.gross-t.deduct from
  (select coalesce(sum(amount_cents) filter(where kind='earning'),0) gross,coalesce(sum(amount_cents) filter(where kind='deduction'),0) deduct from public.payroll_items where payroll_entry_id=p_entry_id) t where pe.id=p_entry_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_tenant_id,auth.uid(),'payroll.adjustment_added','payroll_entry',p_entry_id::text,jsonb_build_object('item_id',v_id,'kind',p_kind,'amount_cents',p_amount_cents));
  return v_id;
end $$;
create function public.add_payroll_adjustment_once(p_tenant_id uuid,p_entry_id uuid,p_kind public.payroll_item_kind,p_name text,p_amount_cents bigint,p_note text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_existing public.payroll_items%rowtype; v_id uuid;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  if p_idempotency_key is null then raise exception 'idempotency key required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||p_idempotency_key::text,0));
  select * into v_existing from public.payroll_items where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.payroll_entry_id is distinct from p_entry_id or v_existing.kind is distinct from p_kind or v_existing.amount_cents is distinct from p_amount_cents or v_existing.name is distinct from trim(p_name) or v_existing.note is distinct from nullif(trim(p_note),'') then raise exception 'idempotency conflict' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  v_id:=public.add_payroll_adjustment(p_tenant_id,p_entry_id,p_kind,p_name,p_amount_cents,p_note);
  update public.payroll_items set idempotency_key=p_idempotency_key where id=v_id;
  return v_id;
end $$;

create function public.remove_payroll_adjustment(p_tenant_id uuid,p_item_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_item public.payroll_items%rowtype;
begin
  if not public.current_user_has_permission(p_tenant_id,'payroll.manage') then raise exception 'payroll.manage permission required' using errcode='42501'; end if;
  -- Same lock ordering as all other payroll mutations.
  perform 1 from public.payroll_periods pp join public.payroll_entries pe on pe.payroll_period_id=pp.id join public.payroll_items pi on pi.payroll_entry_id=pe.id
    where pi.id=p_item_id and pi.tenant_id=p_tenant_id and pp.status='draft' for update of pp;
  if not found then raise exception 'draft adjustment not found' using errcode='55000'; end if;
  delete from public.payroll_items where id=p_item_id and tenant_id=p_tenant_id and source='manual' returning * into v_item;
  if v_item.id is null then raise exception 'manual adjustment required' using errcode='22023'; end if;
  update public.payroll_entries pe set gross_cents=t.gross,deduction_cents=t.deduct,net_cents=t.gross-t.deduct from
  (select coalesce(sum(amount_cents) filter(where kind='earning'),0) gross,coalesce(sum(amount_cents) filter(where kind='deduction'),0) deduct from public.payroll_items where payroll_entry_id=v_item.payroll_entry_id) t where pe.id=v_item.payroll_entry_id;
  insert into public.audit_logs(tenant_id,actor_user_id,action,entity_type,entity_id,before_data)
  values(p_tenant_id,auth.uid(),'payroll.adjustment_removed','payroll_item',p_item_id::text,to_jsonb(v_item));
end $$;

revoke all on function public.can_read_locked_payroll(uuid,uuid,uuid),public.guard_payroll_history(),public.save_employee_compensation(uuid,uuid,date,text,bigint,text),public.review_payroll_period(uuid,uuid,text),public.add_payroll_adjustment_once(uuid,uuid,public.payroll_item_kind,text,bigint,text,uuid),public.remove_payroll_adjustment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_read_locked_payroll(uuid,uuid,uuid),public.save_employee_compensation(uuid,uuid,date,text,bigint,text),public.review_payroll_period(uuid,uuid,text),public.add_payroll_adjustment_once(uuid,uuid,public.payroll_item_kind,text,bigint,text,uuid),public.remove_payroll_adjustment(uuid,uuid) to authenticated;
commit;
