begin;

-- Work request proof attachments.
--
-- Lets an employee attach supporting evidence (e.g. a medical certificate) to
-- their own pending leave/overtime request, and lets a request.manage reviewer
-- read it. Files live in a private Storage bucket keyed by tenant and uploader;
-- attachment metadata is recorded through a permission-checked audited RPC, the
-- same pattern as employee photos and other mutations. Adds an advisory
-- requires_proof flag to leave_types (seeded true for 病假); enforcement of that
-- flag stays advisory until leave-type administration is built.

alter table public.leave_types
  add column requires_proof boolean not null default false;

update public.leave_types set requires_proof = true where code = 'SICK';

create table public.work_request_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  work_request_id uuid not null,
  object_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  content_type text not null check (char_length(content_type) between 1 and 100),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, object_path),
  foreign key (tenant_id, work_request_id)
    references public.work_requests(tenant_id, id) on delete cascade
);

create index work_request_attachments_tenant_request_idx
  on public.work_request_attachments (tenant_id, work_request_id, created_at desc);

alter table public.work_request_attachments enable row level security;

-- work_requests SELECT is already restricted to the owning employee or a
-- request.manage reviewer, so scoping by visible requests covers both.
create policy work_request_attachments_manager_or_self
  on public.work_request_attachments for select to authenticated
  using (work_request_id in (select wr.id from public.work_requests wr));

revoke all privileges on table public.work_request_attachments from anon, authenticated;
grant select on table public.work_request_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-request-proofs', 'work-request-proofs', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path is {tenant_id}/{uploader_auth_uid}/{request_id}/{uuid.ext}: folder[1]
-- is the tenant, folder[2] is the uploader. Employees may write only under their
-- own folder within a tenant they belong to; reads are self or request.manage.
create policy work_request_proofs_owner_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'work-request-proofs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and ((storage.foldername(name))[1])::uuid in (select public.current_user_tenant_ids())
  );
create policy work_request_proofs_owner_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'work-request-proofs'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
create policy work_request_proofs_reader_select on storage.objects for select to authenticated
  using (
    bucket_id = 'work-request-proofs'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.current_user_has_permission(((storage.foldername(name))[1])::uuid, 'request.manage')
    )
  );

create or replace function public.attach_work_request_proof(
  p_tenant_id uuid,
  p_request_id uuid,
  p_object_path text,
  p_file_name text,
  p_content_type text,
  p_size_bytes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.work_requests%rowtype;
  v_attachment_id uuid;
begin
  select wr.* into v_request
  from public.work_requests wr
  join public.employees e
    on e.tenant_id = wr.tenant_id and e.id = wr.employee_id
  where wr.tenant_id = p_tenant_id
    and wr.id = p_request_id
    and e.auth_user_id = (select auth.uid());
  if v_request.id is null then
    raise exception 'only own request proof can be attached' using errcode = '42501';
  end if;

  if exists (select 1 from public.work_request_decisions d where d.work_request_id = p_request_id) then
    raise exception 'decided request cannot be modified' using errcode = '55000';
  end if;
  if exists (select 1 from public.work_request_withdrawals w where w.work_request_id = p_request_id) then
    raise exception 'withdrawn request cannot be modified' using errcode = '55000';
  end if;

  if char_length(coalesce(p_file_name, '')) not between 1 and 200 then
    raise exception 'invalid attachment file name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_content_type, '')) not between 1 and 100 then
    raise exception 'invalid attachment content type' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'attachment size out of range' using errcode = '22023';
  end if;

  insert into public.work_request_attachments (
    tenant_id, work_request_id, object_path, file_name, content_type, size_bytes, uploaded_by
  ) values (
    p_tenant_id, p_request_id, p_object_path, p_file_name, p_content_type, p_size_bytes, (select auth.uid())
  ) returning id into v_attachment_id;

  insert into public.audit_logs (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) values (
    p_tenant_id, (select auth.uid()), 'work_request.proof_attached', 'work_request',
    p_request_id::text,
    jsonb_build_object('attachment_id', v_attachment_id, 'file_name', p_file_name, 'size_bytes', p_size_bytes)
  );

  return v_attachment_id;
end;
$$;

revoke all on function public.attach_work_request_proof(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.attach_work_request_proof(uuid, uuid, text, text, text, integer) to authenticated;

commit;
