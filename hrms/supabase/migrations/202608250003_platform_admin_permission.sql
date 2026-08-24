begin;

-- Global permission reference data. Tenant-specific roles and memberships are
-- provisioned by an audited bootstrap/admin workflow, not by migrations.
insert into public.permissions (code, description)
values ('platform.admin', '完整平台管理權限')
on conflict (code) do update
  set description = excluded.description;

commit;
