-- Supabase production operations, applied after the meal migrations and app.
-- Store the same CRON_SECRET used by Vercel in Vault under
-- hrms_meal_cron_secret before running this file. Never commit the secret.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create or replace function public.invoke_meal_push_scheduler()
returns void language plpgsql security definer set search_path='' as $$
declare v_secret text;
begin
  if not exists(select 1 from public.meal_push_jobs
    where completed_at is null and due_at<=statement_timestamp() and expires_at>statement_timestamp()
      and attempts<3 and (lease_until is null or lease_until<statement_timestamp())) then return; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='hrms_meal_cron_secret';
  if v_secret is null then raise exception 'meal cron secret is not configured'; end if;
  perform net.http_get(url:='https://hrms.8sots.com.tw/api/cron/meal-reminders',
    headers:=jsonb_build_object('Authorization','Bearer '||v_secret),timeout_milliseconds:=15000);
end;
$$;
revoke all on function public.invoke_meal_push_scheduler() from public,anon,authenticated,service_role;
select cron.schedule('hrms-meal-push-reminders','* * * * *','select public.invoke_meal_push_scheduler();');
commit;
