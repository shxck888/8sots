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
