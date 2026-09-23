begin;

-- The QR token is consumed by the first successful punch across all employees.
-- Keep version 2 (30 seconds) and version 1 valid while installed kiosks update.
alter table public.punch_records add column qr_token_hash text
  check (qr_token_hash ~ '^[0-9a-f]{64}$');
create unique index punch_records_qr_token_once_idx
  on public.punch_records (tenant_id, qr_device_id, qr_token_hash)
  where qr_token_hash is not null;

create or replace function public.validate_punch_qr_token(
  p_device_id uuid, p_token text, p_credential_hash text,
  p_current_hash text, p_current_expires_at timestamptz,
  p_previous_hash text, p_previous_expires_at timestamptz
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_slot bigint;
  v_server_slot bigint;
  v_period integer;
  v_message text;
begin
  if p_token ~ '^[0-9a-f]{64}$' then
    return coalesce(
      (p_current_expires_at > statement_timestamp()
        and p_current_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
      or (p_previous_expires_at > statement_timestamp()
        and p_previous_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')),
      false
    );
  end if;
  if p_token !~ '^[23]:(0|[1-9][0-9]{0,11}):[0-9a-f]{64}$'
    or p_credential_hash is null or p_credential_hash !~ '^[0-9a-f]{64}$'
  then
    return false;
  end if;
  v_slot := split_part(p_token, ':', 2)::bigint;
  if split_part(p_token, ':', 1) = '3' then
    v_period := 10;
    v_message := p_device_id::text || ':3:' || v_slot::text;
  else
    v_period := 30;
    v_message := p_device_id::text || ':' || v_slot::text;
  end if;
  v_server_slot := floor(extract(epoch from statement_timestamp()) / v_period)::bigint;
  if v_slot < v_server_slot - 1 or v_slot > v_server_slot + 1 then
    return false;
  end if;
  return split_part(p_token, ':', 3) = encode(
    extensions.hmac(
      convert_to(v_message, 'UTF8'),
      decode(p_credential_hash, 'hex'), 'sha256'
    ), 'hex'
  );
end;
$$;

create or replace function public.record_qr_punch(
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
  v_qr_token_hash text;
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
  if not exists (
    select 1 from public.punch_qr_devices d
    where d.id = p_device_id and d.tenant_id = p_tenant_id
      and d.revoked_at is null and d.paired_at is not null
      and public.validate_punch_qr_token(
        p_device_id, p_token, d.credential_hash,
        d.current_qr_hash, d.current_qr_expires_at,
        d.previous_qr_hash, d.previous_qr_expires_at
      )
  ) then
    raise exception 'QR token expired or invalid' using errcode = '22023';
  end if;

  v_qr_token_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_employee_id::text, 0));
  select pr.id into v_punch_id from public.punch_records pr
  where pr.tenant_id = p_tenant_id and pr.employee_id = v_employee_id
    and pr.idempotency_key = p_idempotency_key;
  if v_punch_id is not null then return v_punch_id; end if;
  if exists (
    select 1 from public.punch_records pr
    where pr.tenant_id = p_tenant_id and pr.qr_device_id = p_device_id
      and pr.qr_token_hash = v_qr_token_hash
  ) then raise exception 'QR token already used' using errcode = '55000'; end if;
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

  -- Hold a shared device lock through the insert so revocation cannot
  -- invalidate the QR between validation and recording the punch.
  select d.id into v_verified_device from public.punch_qr_devices d
  where d.id = p_device_id and d.tenant_id = p_tenant_id
    and d.revoked_at is null and d.paired_at is not null
    and public.validate_punch_qr_token(
      p_device_id, p_token, d.credential_hash,
      d.current_qr_hash, d.current_qr_expires_at,
      d.previous_qr_hash, d.previous_qr_expires_at
    )
  for share;
  if v_verified_device is null then
    raise exception 'QR token expired or invalid' using errcode = '22023';
  end if;

  insert into public.punch_records (
    tenant_id, employee_id, work_date, event_type, client_occurred_at,
    timezone, source, location_verification, qr_device_id, qr_token_hash,
    idempotency_key, created_by
  ) values (
    p_tenant_id, v_employee_id, v_work_date, v_event_type, statement_timestamp(),
    v_timezone, 'qr', 'unavailable', p_device_id, v_qr_token_hash,
    p_idempotency_key, auth.uid()
  ) on conflict (tenant_id, qr_device_id, qr_token_hash)
    where qr_token_hash is not null do nothing
  returning id into v_punch_id;
  if v_punch_id is null then
    raise exception 'QR token already used' using errcode = '55000';
  end if;
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

commit;
