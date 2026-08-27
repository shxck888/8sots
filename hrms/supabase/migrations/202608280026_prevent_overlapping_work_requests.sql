begin;

create index if not exists work_requests_tenant_employee_period_idx
  on public.work_requests (tenant_id, employee_id, starts_at, ends_at);

-- Serialize one employee's submissions, preserve idempotent retries, then reject
-- overlap with pending or approved requests. Withdrawn and rejected requests do
-- not reserve their former time interval.
do $migration$
declare
  v_definition text;
  v_anchor text := $old$select id into v_request_id from public\.work_requests[[:space:]]+where tenant_id = p_tenant_id and employee_id = v_employee_id[[:space:]]+and idempotency_key = p_idempotency_key;[[:space:]]+if v_request_id is not null then return v_request_id; end if;$old$;
  v_replacement text := $new$perform pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || ':' || v_employee_id::text || ':work-request', 0)
  );

  select id into v_request_id from public.work_requests
  where tenant_id = p_tenant_id and employee_id = v_employee_id
    and idempotency_key = p_idempotency_key;
  if v_request_id is not null then return v_request_id; end if;

  if exists (
    select 1 from public.work_requests existing
    where existing.tenant_id = p_tenant_id
      and existing.employee_id = v_employee_id
      and existing.starts_at < v_ends_at
      and existing.ends_at > v_starts_at
      and not exists (
        select 1 from public.work_request_withdrawals withdrawal
        where withdrawal.tenant_id = existing.tenant_id
          and withdrawal.work_request_id = existing.id
      )
      and not exists (
        select 1 from public.work_request_decisions decision
        where decision.tenant_id = existing.tenant_id
          and decision.work_request_id = existing.id
          and decision.decision = 'rejected'
      )
  ) then
    raise exception 'work request overlaps an active request' using errcode = '23P01';
  end if;$new$;
begin
  select pg_get_functiondef(
    'public.create_work_request(uuid,public.work_request_type,uuid,timestamp without time zone,timestamp without time zone,text,uuid)'::regprocedure
  ) into v_definition;
  if v_definition = regexp_replace(v_definition, v_anchor, v_replacement) then
    raise exception 'create_work_request overlap insertion point not found';
  end if;
  execute regexp_replace(v_definition, v_anchor, v_replacement);
end;
$migration$;

commit;
