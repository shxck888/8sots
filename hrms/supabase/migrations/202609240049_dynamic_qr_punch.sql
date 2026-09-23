begin;

-- A kiosk is paired once by an attendance manager. Only hashes of its
-- long-lived credential, one-time pairing code and current QR token are kept.
create table public.punch_qr_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 80),
  credential_hash text,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  current_qr_hash text,
  current_qr_expires_at timestamptz,
  previous_qr_hash text,
  previous_qr_expires_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  unique (tenant_id, id)
);

create unique index punch_qr_devices_pairing_code_idx
  on public.punch_qr_devices (pairing_code_hash)
  where pairing_code_hash is not null;
create index punch_qr_devices_tenant_idx on public.punch_qr_devices (tenant_id, created_at desc);

alter table public.punch_qr_devices enable row level security;
create policy punch_qr_devices_manager_select on public.punch_qr_devices
  for select to authenticated using (
    public.current_user_has_permission(tenant_id, 'attendance.manage')
  );
revoke all on public.punch_qr_devices from public, anon, authenticated;
grant select (id, tenant_id, name, paired_at, last_seen_at, revoked_at, created_at)
  on public.punch_qr_devices to authenticated;

alter table public.punch_records add column qr_device_id uuid;
alter table public.punch_records add constraint punch_records_qr_device_fk
  foreign key (tenant_id, qr_device_id)
  references public.punch_qr_devices (tenant_id, id) on delete restrict;

create function public.create_punch_qr_device(p_tenant_id uuid, p_name text)
returns table(device_id uuid, pairing_code text, pairing_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_id uuid;
  v_expires_at timestamptz;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 80 then
    raise exception 'invalid device name' using errcode = '22023';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  v_expires_at := statement_timestamp() + interval '10 minutes';
  insert into public.punch_qr_devices
    (tenant_id, name, pairing_code_hash, pairing_expires_at, created_by)
  values
    (p_tenant_id, trim(p_name), encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
     v_expires_at, auth.uid())
  returning id into v_id;
  insert into public.audit_logs
    (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values
    (p_tenant_id, auth.uid(), 'punch_qr_device.created', 'punch_qr_device',
     v_id::text, jsonb_build_object('name', trim(p_name)));
  return query select v_id, v_code, v_expires_at;
end;
$$;

create function public.pair_punch_qr_device(p_pairing_code text)
returns table(device_id uuid, credential text, device_name text, tenant_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.punch_qr_devices%rowtype;
  v_code text;
  v_credential text;
  v_tenant_name text;
begin
  v_code := upper(regexp_replace(coalesce(p_pairing_code, ''), '[[:space:]-]', '', 'g'));
  if v_code !~ '^[0-9A-F]{16}$' then
    raise exception 'invalid pairing code' using errcode = '22023';
  end if;
  select * into v_device from public.punch_qr_devices d
  where d.pairing_code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex')
    and d.pairing_expires_at > statement_timestamp()
    and d.paired_at is null and d.revoked_at is null
  for update;
  if v_device.id is null then
    raise exception 'pairing code expired or already used' using errcode = '22023';
  end if;
  v_credential := replace(gen_random_uuid()::text, '-', '') ||
                  replace(gen_random_uuid()::text, '-', '');
  update public.punch_qr_devices d set
    credential_hash = encode(sha256(convert_to(v_credential, 'UTF8')), 'hex'),
    pairing_code_hash = null, pairing_expires_at = null,
    paired_at = statement_timestamp(), last_seen_at = statement_timestamp()
  where d.id = v_device.id;
  select t.name into v_tenant_name from public.tenants t where t.id = v_device.tenant_id;
  insert into public.audit_logs
    (tenant_id, action, entity_type, entity_id, after_data)
  values
    (v_device.tenant_id, 'punch_qr_device.paired', 'punch_qr_device',
     v_device.id::text, jsonb_build_object('name', v_device.name));
  return query select v_device.id, v_credential, v_device.name, v_tenant_name;
end;
$$;

create function public.renew_punch_qr_pairing(p_tenant_id uuid, p_device_id uuid)
returns table(pairing_code text, pairing_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_expires_at timestamptz;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  v_expires_at := statement_timestamp() + interval '10 minutes';
  update public.punch_qr_devices d set
    pairing_code_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
    pairing_expires_at = v_expires_at
  where d.tenant_id = p_tenant_id and d.id = p_device_id
    and d.paired_at is null and d.revoked_at is null;
  if not found then
    raise exception 'unpaired QR device not found' using errcode = '22023';
  end if;
  insert into public.audit_logs
    (tenant_id, actor_user_id, action, entity_type, entity_id)
  values
    (p_tenant_id, auth.uid(), 'punch_qr_device.pairing_renewed',
     'punch_qr_device', p_device_id::text);
  return query select v_code, v_expires_at;
end;
$$;

create function public.issue_punch_qr_token(p_device_id uuid, p_credential text)
returns table(qr_value text, expires_at timestamptz, device_name text, tenant_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.punch_qr_devices%rowtype;
  v_token text;
  v_expires_at timestamptz;
  v_tenant_name text;
begin
  if p_credential !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid device credential' using errcode = '42501';
  end if;
  select * into v_device from public.punch_qr_devices d
  where d.id = p_device_id and d.revoked_at is null
    and d.credential_hash = encode(sha256(convert_to(p_credential, 'UTF8')), 'hex')
  for update;
  if v_device.id is null then
    raise exception 'device not authorized' using errcode = '42501';
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '') ||
             replace(gen_random_uuid()::text, '-', '');
  v_expires_at := statement_timestamp() + interval '35 seconds';
  update public.punch_qr_devices d set
    previous_qr_hash = d.current_qr_hash,
    previous_qr_expires_at = d.current_qr_expires_at,
    current_qr_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    current_qr_expires_at = v_expires_at, last_seen_at = statement_timestamp()
  where d.id = v_device.id;
  select t.name into v_tenant_name from public.tenants t where t.id = v_device.tenant_id;
  return query select '8SOTS-PUNCH:1:' || v_device.id::text || ':' || v_token,
                      v_expires_at, v_device.name, v_tenant_name;
end;
$$;

create function public.revoke_punch_qr_device(p_tenant_id uuid, p_device_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  update public.punch_qr_devices d set
    revoked_at = statement_timestamp(), credential_hash = null,
    pairing_code_hash = null, pairing_expires_at = null,
    current_qr_hash = null, current_qr_expires_at = null,
    previous_qr_hash = null, previous_qr_expires_at = null
  where d.tenant_id = p_tenant_id and d.id = p_device_id and d.revoked_at is null
  returning d.name into v_name;
  if v_name is null then
    raise exception 'active QR device not found' using errcode = '22023';
  end if;
  insert into public.audit_logs
    (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values
    (p_tenant_id, auth.uid(), 'punch_qr_device.revoked', 'punch_qr_device',
     p_device_id::text, jsonb_build_object('name', v_name));
end;
$$;

create function public.record_qr_punch(
  p_tenant_id uuid, p_device_id uuid, p_token text, p_idempotency_key uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_employee_id uuid;
  v_timezone text;
  v_punch_id uuid;
  v_work_date date;
  v_local_date date;
  v_event_type public.punch_event_type;
  v_verified_device uuid;
begin
  select e.id, t.timezone into v_employee_id, v_timezone
  from public.employees e
  join public.tenants t on t.id = e.tenant_id
  where e.tenant_id = p_tenant_id and e.auth_user_id = auth.uid()
    and e.status = 'active'
    and exists (
      select 1 from public.tenant_memberships tm
      where tm.tenant_id = e.tenant_id and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  limit 1;
  if v_employee_id is null then
    raise exception 'active linked employee required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if p_token !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from public.punch_qr_devices d
    where d.id = p_device_id and d.tenant_id = p_tenant_id
      and d.revoked_at is null and d.paired_at is not null
      and ((d.current_qr_expires_at > statement_timestamp()
        and d.current_qr_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
        or (d.previous_qr_expires_at > statement_timestamp()
        and d.previous_qr_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')))
  ) then
    raise exception 'QR token expired or invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_employee_id::text, 0));
  select pr.id into v_punch_id from public.punch_records pr
  where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
    and pr.idempotency_key = p_idempotency_key;
  if v_punch_id is not null then return v_punch_id; end if;
  if exists (
    select 1 from public.active_punch_records pr
    where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
      and pr.occurred_at > statement_timestamp() - interval '30 seconds'
  ) then raise exception 'punch cooldown active' using errcode = '55000'; end if;

  v_local_date := (statement_timestamp() at time zone v_timezone)::date;
  v_work_date := v_local_date;
  if exists (
    select 1 from public.schedule_assignments sa
    join public.schedule_versions sv on sv.tenant_id = sa.tenant_id
      and sv.id = sa.schedule_version_id and sv.status = 'published'
    join public.shift_segments ss on ss.tenant_id = sa.tenant_id and ss.shift_id = sa.shift_id
    where sa.tenant_id = p_tenant_id and sa.employee_id = v_employee_id
      and sa.work_date = v_local_date - 1 and ss.end_minute > 1440
      and statement_timestamp() <= ((sa.work_date::timestamp + make_interval(mins => ss.end_minute)) at time zone v_timezone)
      and (
        select pr.event_type from public.active_punch_records pr
        where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
          and pr.work_date = sa.work_date
        order by pr.occurred_at desc, pr.created_at desc limit 1
      ) = 'clock_in'
  ) then v_work_date := v_local_date - 1; end if;

  select case when pr.event_type = 'clock_in'
    then 'clock_out'::public.punch_event_type else 'clock_in'::public.punch_event_type end
  into v_event_type from public.active_punch_records pr
  where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
    and pr.work_date = v_work_date
  order by pr.occurred_at desc, pr.created_at desc limit 1;
  v_event_type := coalesce(v_event_type, 'clock_in'::public.punch_event_type);

  if exists (
    select 1 from public.schedule_assignments sa
    join public.schedule_versions sv on sv.tenant_id = sa.tenant_id
      and sv.id = sa.schedule_version_id and sv.status = 'published'
    join public.shift_segments ss on ss.tenant_id = sa.tenant_id and ss.shift_id = sa.shift_id
    where sa.tenant_id = p_tenant_id and sa.employee_id = v_employee_id
      and sa.work_date = v_work_date
    group by sa.id
    having count(ss.id) * 2 <= (
      select count(*) from public.active_punch_records pr
      where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
        and pr.work_date = v_work_date
    )
  ) then raise exception 'scheduled punch sequence complete' using errcode = '55000'; end if;

  -- Hold a shared device lock through the insert, so rotation or revocation
  -- cannot invalidate the QR between validation and recording the punch.
  select d.id into v_verified_device from public.punch_qr_devices d
  where d.id = p_device_id and d.tenant_id = p_tenant_id
    and d.revoked_at is null
    and ((d.current_qr_expires_at > statement_timestamp()
      and d.current_qr_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
      or (d.previous_qr_expires_at > statement_timestamp()
      and d.previous_qr_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')))
  for share;
  if v_verified_device is null then
    raise exception 'QR token expired or invalid' using errcode = '22023';
  end if;

  insert into public.punch_records (
    tenant_id, employee_id, work_date, event_type, client_occurred_at,
    timezone, source, location_verification, qr_device_id, idempotency_key, created_by
  ) values (
    p_tenant_id, v_employee_id, v_work_date, v_event_type, statement_timestamp(),
    v_timezone, 'qr', 'unavailable', p_device_id, p_idempotency_key, auth.uid()
  ) returning id into v_punch_id;
  insert into public.audit_logs
    (tenant_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (
    p_tenant_id, auth.uid(), 'punch.recorded', 'punch_record', v_punch_id::text,
    jsonb_build_object('employee_id', v_employee_id, 'work_date', v_work_date,
      'event_type', v_event_type, 'source', 'qr', 'qr_device_id', p_device_id)
  );
  return v_punch_id;
end;
$$;

revoke all on function public.create_punch_qr_device(uuid,text),
  public.pair_punch_qr_device(text), public.issue_punch_qr_token(uuid,text),
  public.renew_punch_qr_pairing(uuid,uuid),
  public.revoke_punch_qr_device(uuid,uuid),
  public.record_qr_punch(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.create_punch_qr_device(uuid,text),
  public.renew_punch_qr_pairing(uuid,uuid),
  public.revoke_punch_qr_device(uuid,uuid),
  public.record_qr_punch(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.pair_punch_qr_device(text),
  public.issue_punch_qr_token(uuid,text) to anon, authenticated;

commit;
