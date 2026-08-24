# Next Steps

Last Updated: 2026-08-24

## Current Phase

**Build 1 — Auth and tenant foundation IN PROGRESS**。應用骨架與靜態工作台已可 build；Supabase migration 尚未套用，尚未完成真實登入、tenant/RLS integration test 或部署。

## Next Recommended Task (P0)

完成可登入且可驗證 tenant isolation 的第一個 end-to-end slice：

1. 建立／連結 Supabase development project，填入本機環境變數。
2. 用 Supabase CLI 套用 `202608240001_foundation.sql`，產生並提交 database TypeScript types。
3. 實作登入、登出、callback/session refresh，以及無 session 的 route protection。
4. 建立兩個 tenant 與測試使用者的安全 seed／fixture，驗證同租戶可讀、跨租戶不可讀、client 不可寫。
5. 將首頁假資料替換為目前使用者、tenant、location 與 membership scope；驗證 mobile/desktop 登入流程。

完成 code、migration apply、integration tests 與文件同步後，Auth/Organization foundation 才能標 DONE。

## Pending Priorities

### P0 — Deployment and security baseline

- 將 Vercel project 的 Root Directory 設為 `hrms`，建立 preview/production 專案與 build checks。
- 決定 Supabase/Vercel region、local/preview/production 分層與 secret rotation。
- 完成 tenant threat model、service-role 使用規則、CSP/security headers、rate limit 與 audit writer。
- 建立 migration ownership、forward-fix、seed、備份及還原驗證流程。
- 確認台灣個資、勞動、薪資及保存政策的合格審查責任。

### P1 — Phase 1 domain foundation

- Organization CRUD 與 permission-checked server mutation。
- Employee 主檔與 effective-dated employment record。
- Shift/Shift Segment、Schedule version/publish 與跨日測試。
- GPS Punch（同意、精度、geofence、反作弊）與 immutable punch evidence。
- Attendance 計算、異常與可重現版本關聯。
- Phase 1 permission matrix 與完整 audit trail。

### P2 — Subsequent phases

- Leave、Overtime、Punch Correction、Approval。
- Salary、Payroll、Insurance、Payslip 與背景 job。
- Notification、Report、Labor Cost、Revenue integration 與進階 rule engine。

## Decisions Needed

- Supabase/Vercel region 及環境拓撲。
- Auth MFA、password recovery、invitation 與帳號綁定政策。
- PostgreSQL 金額表示（`numeric` 或 integer minor unit）。
- Background job/queue、cache、object storage 與 observability。
- REST API versioning、idempotency key 與 pagination conventions。

## Known Issues / Risks

- 原始碼已位於 `shxck888/8sots/hrms`；Vercel project 與自動部署尚未建立。
- 沒有 Supabase credentials；migration 只有靜態 contract tests，尚未由真實 PostgreSQL 執行。
- Docker/Supabase local stack 不可用，因此本輪無法執行 database integration tests。
- 工作台是代表性假資料；打卡按鈕及班表尚無業務行為。
- Payroll、保險、稅務、GPS 與 PII 屬高風險領域，需要專項驗收與法規審查。

## Definition of Done

功能只有在 code completed、相關 migration 已在受控環境驗證、API contract 同步、自動測試通過、tenant/security 影響已檢查且文件更新後才可標 DONE。靜態 UI、設計完成或列入 roadmap 均不算完整功能完成。
