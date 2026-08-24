# Next Steps

Last Updated: 2026-08-24

## Current Phase

**Build 1 — Auth and tenant foundation IN PROGRESS**。應用骨架與靜態工作台已可 build；Supabase production project（Tokyo）與 GitHub integration 已完成，兩筆 foundation migrations 已套用。Vercel checks 已成功，但尚未確認 production credentials/domain，也尚未完成真實登入與 tenant/RLS integration test。

## Next Recommended Task (P0)

完成可登入且可驗證 tenant isolation 的第一個 end-to-end slice：

1. 將 Supabase URL 與 publishable key 設定至 Vercel `8sots-hrms` 的 Preview/Production environments，絕不使用 secret/service-role key 作為 public variable。
2. 驗證 Vercel Root Directory 為 `hrms`，並將 `hrms.8sots.com.tw` 綁定至正確 project。
3. 依 production schema 產生並提交 database TypeScript types。
4. 實作登入、登出、callback/session refresh，以及無 session 的 route protection。
5. 建立兩個 tenant 與測試使用者的安全 fixture，驗證同租戶可讀、跨租戶不可讀、anon/client 不可寫。

完成 code、migration apply、integration tests 與文件同步後，Auth/Organization foundation 才能標 DONE。

## Pending Priorities

### P0 — Deployment and security baseline

- 核對 Vercel `8sots-hrms` 的 Root Directory、Preview/Production environment variables、deployment URL 與 custom domain；目前 commit checks 已成功。
- 決定 Vercel function region、local/preview/production 分層與 secret rotation；Supabase 已選 Tokyo。
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

- Vercel function region 及 preview/production 環境拓撲（Supabase 已選 Tokyo）。
- Auth MFA、password recovery、invitation 與帳號綁定政策。
- PostgreSQL 金額表示（`numeric` 或 integer minor unit）。
- Background job/queue、cache、object storage 與 observability。
- REST API versioning、idempotency key 與 pagination conventions。

## Known Issues / Risks

- 原始碼已位於 `shxck888/8sots/hrms`，Supabase migrations 與 Vercel build checks 已成功；custom domain 與 runtime credentials 尚待驗證。
- Supabase production 已執行兩筆 migrations；credentials 尚未確認放入本機/Vercel，真實 Auth/RLS integration tests 尚未完成。
- Docker/Supabase local stack 不可用，因此本輪無法執行 database integration tests。
- 工作台是代表性假資料；打卡按鈕及班表尚無業務行為。
- Payroll、保險、稅務、GPS 與 PII 屬高風險領域，需要專項驗收與法規審查。

## Definition of Done

功能只有在 code completed、相關 migration 已在受控環境驗證、API contract 同步、自動測試通過、tenant/security 影響已檢查且文件更新後才可標 DONE。靜態 UI、設計完成或列入 roadmap 均不算完整功能完成。
