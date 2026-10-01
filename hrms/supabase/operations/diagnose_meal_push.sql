-- Read-only checks for missed meal reminders. Run in the production Supabase
-- SQL Editor; never paste push keys or Vault secret values into a report.

select jobname, active, schedule, command
from cron.job
where jobname = 'hrms-meal-push-reminders';

select started_at, status, return_message
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'hrms-meal-push-reminders')
order by started_at desc
limit 20;

select exists (
  select 1 from vault.secrets where name = 'hrms_meal_cron_secret'
) as cron_secret_exists;

select s.tenant_id, s.user_id, count(*) as subscribed_device_count
from public.employee_push_subscriptions s
join public.tenant_memberships tm on tm.tenant_id = s.tenant_id
  and tm.user_id = s.user_id and tm.status = 'active'
where exists (
  select 1 from public.membership_roles mr
  join public.role_permissions rp on rp.tenant_id = mr.tenant_id and rp.role_id = mr.role_id
  join public.permissions p on p.id = rp.permission_id
  where mr.tenant_id = tm.tenant_id and mr.membership_id = tm.id
    and p.code in ('attendance.break_notify', 'platform.admin')
)
group by s.tenant_id, s.user_id;

select e.full_name, p.punch_action, p.starts_afternoon_meal,
  p.occurred_at at time zone 'Asia/Taipei' as punch_time_taipei,
  j.kind, j.due_at at time zone 'Asia/Taipei' as due_time_taipei,
  j.expires_at at time zone 'Asia/Taipei' as expires_time_taipei,
  j.attempts, j.completed_at at time zone 'Asia/Taipei' as completed_time_taipei,
  cardinality(j.delivered_subscription_ids) as delivered_device_count
from public.punch_records p
join public.employees e on e.tenant_id = p.tenant_id and e.id = p.employee_id
left join public.meal_push_jobs j on j.punch_id = p.id and j.kind = 'supervisor_meal_finished'
where p.work_date = (now() at time zone 'Asia/Taipei')::date
  and (p.punch_action in ('meal_morning', 'meal_afternoon') or p.starts_afternoon_meal)
order by p.occurred_at desc;
