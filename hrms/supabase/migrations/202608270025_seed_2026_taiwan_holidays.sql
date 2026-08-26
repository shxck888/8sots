begin;

-- Official 2026 (ROC year 115) calendar published by Taiwan's Directorate-
-- General of Personnel Administration. Only rows marked as holidays with a
-- non-empty official note are seeded; ordinary unnamed weekends are omitted.
-- Source: https://data.gov.tw/dataset/14718
with official_holidays(holiday_date, name) as (
  values
    (date '2026-01-01', '開國紀念日'),
    (date '2026-02-15', '小年夜'),
    (date '2026-02-16', '農曆除夕'),
    (date '2026-02-17', '春節'),
    (date '2026-02-18', '春節'),
    (date '2026-02-19', '春節'),
    (date '2026-02-20', '補假'),
    (date '2026-02-27', '補假'),
    (date '2026-02-28', '和平紀念日'),
    (date '2026-04-03', '補假'),
    (date '2026-04-04', '兒童節'),
    (date '2026-04-05', '清明節'),
    (date '2026-04-06', '補假'),
    (date '2026-05-01', '勞動節'),
    (date '2026-06-19', '端午節'),
    (date '2026-09-25', '中秋節'),
    (date '2026-09-28', '孔子誕辰紀念日/教師節'),
    (date '2026-10-09', '補假'),
    (date '2026-10-10', '國慶日'),
    (date '2026-10-25', '臺灣光復暨金門古寧頭大捷紀念日'),
    (date '2026-10-26', '補假'),
    (date '2026-12-25', '行憲紀念日')
), target_tenants as (
  select id from public.tenants where slug = '8sots'
), inserted as (
  insert into public.holiday_calendar_entries (
    tenant_id, holiday_date, name, kind, note
  )
  select tenant.id, holiday.holiday_date, holiday.name,
    'national'::public.holiday_kind,
    '行政院人事行政總處 115 年辦公日曆表'
  from target_tenants tenant
  cross join official_holidays holiday
  on conflict (tenant_id, holiday_date) do nothing
  returning tenant_id, holiday_date
)
insert into public.audit_logs (
  tenant_id, actor_user_id, action, entity_type, entity_id, after_data
)
select tenant.id, null, 'holiday.official_calendar_imported',
  'holiday_calendar_import', '2026-dgpa',
  jsonb_build_object(
    'year', 2026,
    'source', 'https://data.gov.tw/dataset/14718',
    'inserted_dates', coalesce(
      (select jsonb_agg(i.holiday_date order by i.holiday_date)
       from inserted i where i.tenant_id = tenant.id),
      '[]'::jsonb
    )
  )
from target_tenants tenant;

commit;
