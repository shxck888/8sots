# Next Steps

Last Updated: 2026-08-25

## Current Phase

**Build 1 — Auth, tenant and employee foundation DONE**。自訂帳號登入、管理員、完整 Employee Master、員工帳號生命週期與第二 tenant 跨租戶隔離皆已通過 production 驗證。

## Next Recommended Task (P0)

完成 Schema/application contract 收斂，為下一個 domain module 建立型別安全基線：

1. 依 production schema 產生並提交 Supabase Database TypeScript types。
2. 將 server、admin 與 Employee data access 改用產生的 Database generic。
3. 加入 types drift 檢查，避免 migration 與 application contract 分歧。
4. 完成後開始 Shift/Shift Segment 與 Schedule version/publish schema。

跨租戶測試已收錄於 `supabase/tests/cross_tenant_rls.sql`，六項 production assertion 通過並確認 fixture 殘留為 0。

## Pending Priorities

### P0 — Deployment and security baseline

- 驗證每次 GitHub commit 的 Vercel production deployment 與 custom-domain TLS 狀態。
- 決定 Vercel function region、local/preview/production 分層與 secret rotation；Supabase 已選 Tokyo。
- 定義邀請、內部 identifier 改名、password recovery、MFA 與帳號停用政策。
- 完成 tenant threat model、service-role 使用規則、CSP/security headers、rate limit 與 audit writer。
- 建立 migration ownership、forward-fix、seed、備份及還原驗證流程。
- 確認台灣個資、勞動、薪資及保存政策的合格審查責任。

### P1 — Phase 1 domain foundation

- Organization CRUD 與其他模組的 permission-checked server mutation。
- Password recovery、invitation 與 MFA（Employee 帳號建立／重設／停用／恢復已完成）。
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
- Auth MFA、非 Email 帳號的 password recovery、invitation 與帳號綁定政策。
- PostgreSQL 金額表示（`numeric` 或 integer minor unit）。
- Background job/queue、cache 與 observability（員工照片已採 Supabase Storage）。
- REST API versioning、idempotency key 與 pagination conventions。

## Known Issues / Risks

- Production 維持單一正式 tenant；第二 tenant 僅在 rollback-only integration test transaction 中建立，不是常駐測試資料。
- Docker/Supabase local stack 不可用；真實 database integration tests 必須在受控遠端環境執行。
- 工作台班表、統計與打卡仍是代表性假資料，尚無業務行為。
- Payroll、保險、稅務、GPS 與 PII 屬高風險領域，需要專項驗收與法規審查。

## Definition of Done

功能只有在 code completed、相關 migration 已在受控環境驗證、API contract 同步、自動測試通過、tenant/security 影響已檢查且文件更新後才可標 DONE。靜態 UI、設計完成或列入 roadmap 均不算完整功能完成。
