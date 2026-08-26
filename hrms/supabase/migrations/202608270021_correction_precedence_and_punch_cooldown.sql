begin;

-- Approved corrections are replacement evidence, not an additional raw punch.
-- Collapse events beyond the scheduled segment count into the final slot and
-- prefer approved corrections there, while retaining all append-only evidence.
do $migration$
declare
  v_definition text;
  v_old text := $old$\),[[:space:]]*ranked as \([[:space:]]*select \*, row_number\(\) over \(partition by event_type order by occurred_at, coalesce\(id, correction_id\)\) as rn from events[[:space:]]*\)[[:space:]]*select occurred_at, id, correction_id into$old$;
  v_new text := $new$
      ), ordered as (
        select *, row_number() over (
          partition by event_type order by occurred_at, coalesce(id, correction_id)
        ) as event_rank
        from events
      ), ranked as (
        select *, least(event_rank, v_segment_count::bigint) as rn,
          case when correction_id is not null then 0 else 1 end as source_priority
        from ordered
      )
      select occurred_at, id, correction_id into $new$;
  v_old_in text := $old$from ranked where event_type = 'clock_in' and rn = v_segment.segment_order;$old$;
  v_new_in text := $new$from ranked where event_type = 'clock_in' and rn = v_segment.segment_order
      order by source_priority, occurred_at desc, coalesce(id, correction_id) limit 1;$new$;
  v_old_out text := $old$from ranked where event_type = 'clock_out' and rn = v_segment.segment_order;$old$;
  v_new_out text := $new$from ranked where event_type = 'clock_out' and rn = v_segment.segment_order
      order by source_priority, occurred_at desc, coalesce(id, correction_id) limit 1;$new$;
  v_old_count text := $old$\+[[:space:]]*\(select count\(\*\) from public\.punch_correction_requests r[[:space:]]+join public\.punch_correction_decisions d on d\.tenant_id = r\.tenant_id[[:space:]]+and d\.correction_request_id = r\.id and d\.decision = 'approved'[[:space:]]+where r\.tenant_id = p_tenant_id and r\.employee_id = v_item\.employee_id[[:space:]]+and r\.work_date = v_item\.work_date\)[[:space:]]*\)[[:space:]]*> v_segment_count \* 2 then$old$;
  v_new_count text := $new$
    ) > v_segment_count * 2 then$new$;
  v_old_actual text := $old$v_actual := case when v_in_at is not null and v_out_at is not null and v_out_at >= v_in_at[[:space:]]+then floor\(extract\(epoch from \(v_out_at - v_in_at\)\) / 60\)::integer else 0 end;$old$;
  v_new_actual text := $new$v_actual := case
        when v_in_at is not null and v_out_at is not null and v_out_at >= v_in_at
        then greatest(0, floor(extract(epoch from (
          least(v_out_at, v_scheduled_end) - greatest(v_in_at, v_scheduled_start)
        )) / 60)::integer)
        else 0
      end;$new$;
begin
  select pg_get_functiondef('public.calculate_attendance_v1(uuid,date,date)'::regprocedure)
  into v_definition;
  if v_definition = regexp_replace(v_definition, v_old, v_new, 'g') then
    raise exception 'calculate_attendance event ranking pattern not found';
  end if;
  v_definition := regexp_replace(v_definition, v_old, v_new, 'g');
  v_definition := replace(v_definition, v_old_in, v_new_in);
  v_definition := replace(v_definition, v_old_out, v_new_out);
  if v_definition = regexp_replace(v_definition, v_old_count, v_new_count) then
    raise exception 'calculate_attendance unmatched-count pattern not found';
  end if;
  v_definition := regexp_replace(v_definition, v_old_count, v_new_count);
  if v_definition = regexp_replace(v_definition, v_old_actual, v_new_actual) then
    raise exception 'calculate_attendance actual-minutes pattern not found';
  end if;
  v_definition := regexp_replace(v_definition, v_old_actual, v_new_actual);
  execute v_definition;
end;
$migration$;

-- Preserve idempotency, but reject a new rapid tap before it creates an
-- alternating clock-in/clock-out record.
do $migration$
declare
  v_definition text;
  v_old text := $old$if v_punch_id is not null then return v_punch_id; end if;[[:space:]]*v_work_date :=$old$;
  v_new text := $new$
  if v_punch_id is not null then return v_punch_id; end if;

  if exists (
    select 1 from public.punch_records pr
    where pr.tenant_id = p_tenant_id
      and pr.employee_id = v_employee_id
      and pr.occurred_at > statement_timestamp() - interval '30 seconds'
  ) then
    raise exception 'punch cooldown active' using errcode = '55000';
  end if;

  v_work_date := $new$;
begin
  select pg_get_functiondef(
    'public.record_gps_punch(uuid,uuid,timestamp with time zone,text,numeric,numeric,numeric,boolean)'::regprocedure
  ) into v_definition;
  if v_definition = regexp_replace(v_definition, v_old, v_new) then
    raise exception 'record_gps_punch cooldown insertion point not found';
  end if;
  execute regexp_replace(v_definition, v_old, v_new);
end;
$migration$;

commit;
