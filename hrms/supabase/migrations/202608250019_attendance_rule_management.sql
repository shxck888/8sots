begin;

-- Attendance Rule Set management.
--
-- Migration 014 created versioned public.attendance_rule_sets and seeded V1
-- (0/0 grace, effective 2026-01-01). calculate_attendance selects the rule set
-- with the greatest effective_from (<= the run's end date), tie-broken by the
-- highest version. This migration adds a permission-checked audited RPC so an
-- attendance manager can publish a NEW rule set version (e.g. Rule Set V2 with
-- confirmed grace minutes) without overwriting earlier versions, preserving the
-- immutable-by-version history required for reproducible recalculation.

create or replace function public.create_attendance_rule_set(
  p_tenant_id uuid,
  p_late_grace_minutes integer,
  p_early_leave_grace_minutes integer,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_set_id uuid;
  v_version integer;
begin
  if not public.current_user_has_permission(p_tenant_id, 'attendance.manage') then
    raise exception 'attendance.manage permission required' using errcode = '42501';
  end if;
  if p_effective_from is null then
    raise exception 'effective date is required' using errcode = '22023';
  end if;
  if p_late_grace_minutes is null or p_late_grace_minutes < 0 or p_late_grace_minutes > 120 then
    raise exception 'late grace minutes out of range' using errcode = '22023';
  end if;
  if p_early_leave_grace_minutes is null or p_early_leave_grace_minutes < 0 or p_early_leave_grace_minutes > 120 then
    raise exception 'early leave grace minutes out of range' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':attendance_rule_set', 0));
  select coalesce(max(version), 0) + 1 into v_version
  from public.attendance_rule_sets
  where tenant_id = p_tenant_id;

  insert into public.attendance_rule_sets (
    tenant_id, version, late_grace_minutes, early_leave_grace_minutes, effective_from, created_by
  ) values (
    p_tenant_id, v_version, p_late_grace_minutes, p_early_leave_grace_minutes,
    p_effective_from, (select auth.uid())
  ) returning id into v_rule_set_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'attendance.rule_set_created',
    'attendance_rule_set', v_rule_set_id::text,
    jsonb_build_object(
      'version', v_version,
      'late_grace_minutes', p_late_grace_minutes,
      'early_leave_grace_minutes', p_early_leave_grace_minutes,
      'effective_from', p_effective_from
    )
  );

  return v_rule_set_id;
end;
$$;

revoke all on function public.create_attendance_rule_set(uuid, integer, integer, date) from public, anon, authenticated;
grant execute on function public.create_attendance_rule_set(uuid, integer, integer, date) to authenticated;

commit;
