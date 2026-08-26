begin;

-- Holiday Calendar foundation.
--
-- A tenant-scoped, dated list of national holidays, company holidays and make-up
-- workdays. It feeds pre-publish schedule integrity warnings (advisory only) and
-- future holiday-aware rules. Consistent with ADR-017: whether a date is treated as
-- a holiday for scheduling is still expressed by the shift the scheduler picks; this
-- calendar is reference data, not an automatic scheduling rule. Reuses the existing
-- schedule.manage permission rather than adding a new permission code.

create type public.holiday_kind as enum ('national', 'company', 'makeup_workday');

create table public.holiday_calendar_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  holiday_date date not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind public.holiday_kind not null default 'national',
  note text check (note is null or char_length(note) <= 300),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, holiday_date)
);

create index holiday_calendar_entries_tenant_date_idx
  on public.holiday_calendar_entries (tenant_id, holiday_date);

insert into public.permissions (code, description)
values ('schedule.manage', '建立、編輯及發布班表')
on conflict (code) do update set description = excluded.description;

alter table public.holiday_calendar_entries enable row level security;

create policy holiday_calendar_entries_select_same_tenant
  on public.holiday_calendar_entries for select to authenticated
  using (tenant_id in (select public.current_user_tenant_ids()));

revoke all privileges on table public.holiday_calendar_entries from anon, authenticated;
grant select on table public.holiday_calendar_entries to authenticated;

create or replace function public.upsert_holiday_entry(
  p_tenant_id uuid,
  p_holiday_date date,
  p_name text,
  p_kind public.holiday_kind,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;
  if p_holiday_date is null then
    raise exception 'holiday date is required' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'invalid holiday name' using errcode = '22023';
  end if;
  if p_kind is null then
    raise exception 'holiday kind is required' using errcode = '22023';
  end if;

  select to_jsonb(h), h.id into v_before, v_entry_id
  from public.holiday_calendar_entries h
  where h.tenant_id = p_tenant_id and h.holiday_date = p_holiday_date
  for update;

  if v_entry_id is null then
    insert into public.holiday_calendar_entries (
      tenant_id, holiday_date, name, kind, note, created_by, updated_by
    ) values (
      p_tenant_id, p_holiday_date, trim(p_name), p_kind,
      nullif(trim(coalesce(p_note, '')), ''),
      (select auth.uid()), (select auth.uid())
    ) returning id into v_entry_id;
  else
    update public.holiday_calendar_entries
    set name = trim(p_name),
        kind = p_kind,
        note = nullif(trim(coalesce(p_note, '')), ''),
        updated_by = (select auth.uid()),
        updated_at = now()
    where tenant_id = p_tenant_id and id = v_entry_id;
  end if;

  select to_jsonb(h) into v_after
  from public.holiday_calendar_entries h
  where h.tenant_id = p_tenant_id and h.id = v_entry_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    p_tenant_id, (select auth.uid()),
    case when v_before is null then 'holiday.created' else 'holiday.updated' end,
    'holiday_calendar_entry', v_entry_id::text, v_before, v_after
  );

  return v_entry_id;
end;
$$;

create or replace function public.delete_holiday_entry(
  p_tenant_id uuid,
  p_holiday_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if not public.current_user_has_permission(p_tenant_id, 'schedule.manage') then
    raise exception 'schedule.manage permission required' using errcode = '42501';
  end if;

  select to_jsonb(h) into v_before
  from public.holiday_calendar_entries h
  where h.tenant_id = p_tenant_id and h.id = p_holiday_id
  for update;
  if v_before is null then
    raise exception 'holiday entry not found' using errcode = 'P0002';
  end if;

  delete from public.holiday_calendar_entries
  where tenant_id = p_tenant_id and id = p_holiday_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, before_data
  ) values (
    p_tenant_id, (select auth.uid()), 'holiday.deleted',
    'holiday_calendar_entry', p_holiday_id::text, v_before
  );
end;
$$;

revoke all on function public.upsert_holiday_entry(uuid, date, text, public.holiday_kind, text) from public;
revoke all on function public.delete_holiday_entry(uuid, uuid) from public;
grant execute on function public.upsert_holiday_entry(uuid, date, text, public.holiday_kind, text) to authenticated;
grant execute on function public.delete_holiday_entry(uuid, uuid) to authenticated;

commit;
