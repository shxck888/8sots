begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('request','attendance','schedule','payroll','system')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  href text not null check (href like '/%' and char_length(href) <= 300),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 120),
  event_key text not null check (char_length(event_key) between 1 and 240),
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (tenant_id, id),
  unique (tenant_id, recipient_user_id, event_key)
);

create index notifications_inbox_idx
  on public.notifications (recipient_user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_self_read on public.notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()) and tenant_id in (select public.current_user_tenant_ids()));

revoke all privileges on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

create function public.enqueue_notification(
  p_tenant_id uuid, p_recipient_user_id uuid, p_kind text, p_title text, p_body text,
  p_href text, p_entity_type text, p_entity_id text, p_event_key text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient_user_id is null or not exists (
    select 1 from public.tenant_memberships tm
    where tm.tenant_id = p_tenant_id and tm.user_id = p_recipient_user_id and tm.status = 'active'
  ) then return; end if;
  insert into public.notifications (
    tenant_id, recipient_user_id, kind, title, body, href, entity_type, entity_id, event_key
  ) values (
    p_tenant_id, p_recipient_user_id, p_kind, p_title, p_body, p_href, p_entity_type, p_entity_id, p_event_key
  ) on conflict (tenant_id, recipient_user_id, event_key) do nothing;
end $$;

create function public.notify_permission_holders(
  p_tenant_id uuid, p_permission_code text, p_kind text, p_title text, p_body text,
  p_href text, p_entity_type text, p_entity_id text, p_event_key text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  for v_user_id in
    select distinct tm.user_id
    from public.tenant_memberships tm
    join public.membership_roles mr on mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
    join public.role_permissions rp on rp.tenant_id = mr.tenant_id and rp.role_id = mr.role_id
    join public.permissions p on p.id = rp.permission_id
    where tm.tenant_id = p_tenant_id and tm.status = 'active' and p.code = p_permission_code
  loop
    perform public.enqueue_notification(p_tenant_id, v_user_id, p_kind, p_title, p_body,
      p_href, p_entity_type, p_entity_id, p_event_key);
  end loop;
end $$;

create function public.mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id and recipient_user_id = auth.uid()
    and tenant_id in (select public.current_user_tenant_ids());
  if not found then raise exception 'notification not found' using errcode = 'P0002'; end if;
end $$;

create function public.mark_all_notifications_read(p_tenant_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_tenant_id not in (select public.current_user_tenant_ids()) then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  update public.notifications set read_at = clock_timestamp()
  where tenant_id = p_tenant_id and recipient_user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create function public.notify_work_request_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees%rowtype; v_request public.work_requests%rowtype;
begin
  if tg_table_name = 'work_requests' then
    select * into v_employee from public.employees where tenant_id = new.tenant_id and id = new.employee_id;
    perform public.notify_permission_holders(new.tenant_id, 'request.manage', 'request',
      case when new.request_type = 'leave' then '新的請假申請' else '新的加班申請' end,
      v_employee.employee_no || ' · ' || v_employee.full_name || ' 已送出申請。',
      '/admin/requests', 'work_request', new.id::text, 'work-request:created:' || new.id::text);
  elsif tg_table_name = 'work_request_decisions' then
    select * into v_request from public.work_requests where tenant_id = new.tenant_id and id = new.work_request_id;
    select * into v_employee from public.employees where tenant_id = new.tenant_id and id = v_request.employee_id;
    perform public.enqueue_notification(new.tenant_id, v_employee.auth_user_id, 'request',
      case when new.decision = 'approved' then '申請已核准' else '申請未核准' end,
      case when v_request.request_type = 'leave' then '你的請假申請已有審核結果。' else '你的加班申請已有審核結果。' end,
      '/requests', 'work_request', v_request.id::text, 'work-request:decision:' || new.id::text);
  else
    select * into v_request from public.work_requests where tenant_id = new.tenant_id and id = new.work_request_id;
    select * into v_employee from public.employees where tenant_id = new.tenant_id and id = v_request.employee_id;
    perform public.notify_permission_holders(new.tenant_id, 'request.manage', 'request', '申請已撤回',
      v_employee.employee_no || ' · ' || v_employee.full_name || ' 已撤回待審申請。',
      '/admin/requests', 'work_request', v_request.id::text, 'work-request:withdrawn:' || new.id::text);
  end if;
  return new;
end $$;

create trigger work_request_created_notification after insert on public.work_requests
  for each row execute function public.notify_work_request_event();
create trigger work_request_decided_notification after insert on public.work_request_decisions
  for each row execute function public.notify_work_request_event();
create trigger work_request_withdrawn_notification after insert on public.work_request_withdrawals
  for each row execute function public.notify_work_request_event();

create function public.notify_correction_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_employee public.employees%rowtype; v_request public.punch_correction_requests%rowtype;
begin
  if tg_table_name = 'punch_correction_requests' then
    select * into v_employee from public.employees where tenant_id = new.tenant_id and id = new.employee_id;
    perform public.notify_permission_holders(new.tenant_id, 'attendance.manage', 'attendance', '新的補打卡申請',
      v_employee.employee_no || ' · ' || v_employee.full_name || ' 已送出補打卡申請。',
      '/admin/attendance', 'punch_correction_request', new.id::text, 'correction:created:' || new.id::text);
  else
    select * into v_request from public.punch_correction_requests where tenant_id = new.tenant_id and id = new.correction_request_id;
    select * into v_employee from public.employees where tenant_id = new.tenant_id and id = v_request.employee_id;
    perform public.enqueue_notification(new.tenant_id, v_employee.auth_user_id, 'attendance',
      case when new.decision = 'approved' then '補打卡已核准' else '補打卡未核准' end,
      '你在 ' || v_request.work_date::text || ' 的補打卡申請已有審核結果。',
      '/attendance', 'punch_correction_request', v_request.id::text, 'correction:decision:' || new.id::text);
  end if;
  return new;
end $$;

create trigger correction_created_notification after insert on public.punch_correction_requests
  for each row execute function public.notify_correction_event();
create trigger correction_decided_notification after insert on public.punch_correction_decisions
  for each row execute function public.notify_correction_event();

create function public.notify_schedule_published()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid;
begin
  if new.status = 'published' and old.status is distinct from new.status then
    for v_user_id in
      select distinct e.auth_user_id from public.schedule_assignments sa
      join public.employees e on e.tenant_id = sa.tenant_id and e.id = sa.employee_id
      join public.tenant_memberships tm on tm.tenant_id = e.tenant_id and tm.user_id = e.auth_user_id and tm.status = 'active'
      where sa.tenant_id = new.tenant_id and sa.schedule_version_id = new.id and e.auth_user_id is not null
    loop
      perform public.enqueue_notification(new.tenant_id, v_user_id, 'schedule', '新班表已發布',
        new.period_start::text || ' 至 ' || new.period_end::text || ' 的班表已可查看。',
        '/my-schedule', 'schedule_version', new.id::text, 'schedule:published:' || new.id::text);
    end loop;
  end if;
  return new;
end $$;
create trigger schedule_published_notification after update of status on public.schedule_versions
  for each row execute function public.notify_schedule_published();

create function public.notify_payroll_locked()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_recipient record;
begin
  if new.status = 'locked' and old.status is distinct from new.status then
    for v_recipient in
      select e.auth_user_id, e.employee_no from public.payroll_entries pe
      join public.employees e on e.tenant_id = pe.tenant_id and e.id = pe.employee_id
      join public.tenant_memberships tm on tm.tenant_id = e.tenant_id and tm.user_id = e.auth_user_id and tm.status = 'active'
      where pe.tenant_id = new.tenant_id and pe.payroll_period_id = new.id and e.auth_user_id is not null
    loop
      perform public.enqueue_notification(new.tenant_id, v_recipient.auth_user_id, 'payroll', '薪資單已發布',
        to_char(new.period_month, 'YYYY-MM') || ' 薪資單已可查看。', '/payslips',
        'payroll_period', new.id::text, 'payroll:locked:' || new.id::text);
    end loop;
  end if;
  return new;
end $$;
create trigger payroll_locked_notification after update of status on public.payroll_periods
  for each row execute function public.notify_payroll_locked();

revoke all on function public.enqueue_notification(uuid,uuid,text,text,text,text,text,text,text),
  public.notify_permission_holders(uuid,text,text,text,text,text,text,text,text),
  public.mark_notification_read(uuid), public.mark_all_notifications_read(uuid),
  public.notify_work_request_event(), public.notify_correction_event(),
  public.notify_schedule_published(), public.notify_payroll_locked() from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid), public.mark_all_notifications_read(uuid) to authenticated;

commit;
