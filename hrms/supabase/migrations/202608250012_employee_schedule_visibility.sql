begin;

drop policy if exists schedule_assignments_select_same_tenant on public.schedule_assignments;

create policy schedule_assignments_select_manager_or_self_published
on public.schedule_assignments for select to authenticated
using (
  tenant_id in (select public.current_user_tenant_ids())
  and (
    public.current_user_has_permission(tenant_id, 'schedule.manage')
    or (
      employee_id in (
        select e.id
        from public.employees e
        where e.tenant_id = schedule_assignments.tenant_id
          and e.auth_user_id = (select auth.uid())
      )
      and exists (
        select 1
        from public.schedule_versions sv
        where sv.tenant_id = schedule_assignments.tenant_id
          and sv.id = schedule_assignments.schedule_version_id
          and sv.status = 'published'
      )
    )
  )
);

commit;
