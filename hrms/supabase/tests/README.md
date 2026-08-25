# Supabase Integration Tests

這個目錄保存需要真實 Supabase PostgreSQL/RLS 環境的安全測試，不會由一般 Vitest 自動連線至 production。

## Cross-tenant RLS

`cross_tenant_rls.sql` 需由 project owner 在 Supabase SQL Editor 執行。測試會：

1. 從 versioned RBAC 資料解析 `8sots` production platform administrator。
2. 在 transaction 中建立第二 tenant、兩個 company 與第二 tenant employee fixture。
3. 切換成 `authenticated` role 並模擬該管理員 JWT subject。
4. 驗證同租戶可讀、跨租戶 Tenant/Employee 不可讀、authenticated client 不可直接寫入、跨租戶 RPC 不可執行。
5. 驗證 composite tenant foreign key 阻擋跨租戶關聯，並驗證 anon 無 Data API 讀取權限。
6. 回傳六個 `true` 後執行 `ROLLBACK`。

預期結果：

```text
same_tenant_read | cross_tenant_read_blocked | authenticated_write_blocked |
anonymous_access_blocked | cross_tenant_rpc_blocked | cross_tenant_fk_blocked
true             | true                      | true                        |
true                     | true                     | true
```

執行後可用以下查詢確認沒有 fixture 殘留：

```sql
select
  (select count(*) from public.tenants
   where slug = 'rls-integration-fixture') as tenants,
  (select count(*) from public.companies
   where tax_id in ('RLS-A', 'RLS-B')) as companies,
  (select count(*) from public.employees
   where employee_no in ('RLSB001', 'RLSB002')) as employees;
```

三個結果都必須為 `0`。任何 assertion failure 都會中止 transaction；若 SQL client 未自動結束失敗的 transaction，手動執行 `ROLLBACK`。

## Employee published schedule RLS

`employee_schedule_visibility.sql` 會在 transaction 中建立兩位 Employee、一個無管理角色的 Auth fixture、published／draft Schedule 與三筆 Assignment，接著模擬該員工 JWT，驗證：

1. 自己的 published assignment 可讀。
2. 同 tenant 另一位員工的 published assignment 不可讀。
3. 自己的 draft assignment 不可讀。

成功時回傳三個 `true`，最後執行 `ROLLBACK`；所有 Auth、Employee、Membership 與 Schedule fixtures 都不會保留。

## GPS punch foundation

`punch_foundation.sql` 以 rollback-only fixture 驗證：第一、第二次打卡依序為上班與下班；重送相同 idempotency key 不會新增資料；authenticated client 無法直接寫入；原始打卡紀錄無法修改。成功時回傳四個 `true`，所有測試資料最後都會回滾。

## Attendance calculation and correction

`attendance_calculation.sql` 建立一位連結 Auth 的測試員工、當日兩段班與三筆原始打卡，驗證缺下班卡、員工本人更正申請、管理員核准、核准後重算為 530 分鐘、舊計算批次仍保留，以及 authenticated client 無法直接寫 Attendance Day。成功時回傳四個 `true` 並 `ROLLBACK` 全部 fixture。

## Navigation aggregate RPCs

`navigation_performance.sql` 驗證工作區身份只回傳一列、個人班表與出勤聚合 RPC 可執行且出勤結果具有固定 JSON 結構，並確認匿名角色無法呼叫身份查詢。測試只讀取既有 production identity，最後仍會執行 `ROLLBACK`。

## Request Center V2

`request_center_v2.sql` 需在 `017` migration 之後執行，使用既有已連結且有管理權限的員工身份，在 transaction 中驗證待審申請撤回、撤回後禁止審核，以及年度假別額度 upsert。成功時回傳三個 `true`，最後 `ROLLBACK`，不留下申請或額度資料。
