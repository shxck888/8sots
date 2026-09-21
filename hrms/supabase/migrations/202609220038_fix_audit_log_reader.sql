begin;

create or replace function public.get_audit_log_page(
  p_tenant_id uuid,
  p_limit integer default 100,
  p_before timestamptz default null
)
returns table(
  id bigint,
  actor_user_id uuid,
  actor_email text,
  action text,
  entity_type text,
  entity_id text,
  request_id text,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.current_user_has_permission(p_tenant_id, 'security.audit') then
    raise exception 'security.audit permission required' using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.actor_user_id,
    coalesce(u.email, '')::text,
    a.action,
    a.entity_type,
    a.entity_id,
    a.request_id,
    a.before_data,
    a.after_data,
    a.occurred_at
  from public.audit_logs a
  left join auth.users u on u.id = a.actor_user_id
  where a.tenant_id = p_tenant_id
    and (p_before is null or a.occurred_at < p_before)
  order by a.occurred_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

revoke all on function public.get_audit_log_page(uuid,integer,timestamptz) from public, anon;
grant execute on function public.get_audit_log_page(uuid,integer,timestamptz) to authenticated;

commit;
