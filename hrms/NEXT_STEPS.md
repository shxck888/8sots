# Next Steps

Last Updated: 2026-08-25

## Current Phase

**Build 1 — Auth and tenant foundation IN PROGRESS**。應用、Supabase migrations、Vercel、custom domain、public credentials 與登入程式切片已建立；尚未完成正式帳號登入與 tenant/RLS integration test。

## Next Recommended Task (P0)

完成 Auth/Organization 的 production end-to-end 驗收：

1. 在 Supabase Auth 建立受控的首位管理員／測試帳號，確認 email/password provider 與 Site URL、Redirect URLs 包含正式網域。
2. 為測試帳號建立 active tenant membership，從 `https://hrms.8sots.com.tw/login` 完成登入、session refresh、首頁資料與登出 smoke test。
3. 建立第二 tenant 與測試使用者 fixture，驗證同租戶可讀、跨租戶不可讀、anon/client 不可寫。
4. 依 production schema 產生並提交 database TypeScript types。

上述 integration tests 與文件同步完成後，Auth/Organization foundation 才能標 DONE。

## Pending Priorities

### P0 — Deployment and security baseline

- 驗證每次 GitHub commit 的 Vercel production deployment 與 custom-domain TLS 狀態。
- 決定 Vercel function region、local/preview/production 分層與 secret rotation；Supabase 已選 Tokyo。
- 定義邀請、首位管理員、password recovery、MFA 與帳號停用政策。
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

- Vercel function region 及 preview/production 環境拓撲。
- Auth MFA、password recovery、invitation 與帳號綁定政策。
- PostgreSQL 金額表示（`numeric` 或 integer minor unit）。
- Background job/queue、cache、object storage 與 observability。
- REST API versioning、idempotency key 與 pagination conventions。

## Known Issues / Risks

- 沒有受控的測試帳號與 tenant fixtures，因此登入程式尚不能標 DONE。
- Docker/Supabase local stack 不可用；真實 database integration tests 必須在受控遠端環境執行。
- 工作台班表、統計與打卡仍是代表性假資料，尚無業務行為。
- Payroll、保險、稅務、GPS 與 PII 屬高風險領域，需要專項驗收與法規審查。

## Definition of Done

功能只有在 code completed、相關 migration 已在受控環境驗證、API contract 同步、自動測試通過、tenant/security 影響已檢查且文件更新後才可標 DONE。靜態 UI、設計完成或列入 roadmap 均不算完整功能完成。
