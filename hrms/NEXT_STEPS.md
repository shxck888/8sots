# Next Steps

Last Updated: 2026-08-25

## Current Phase

**Build 1、管理員週排班與員工 published schedule 第一版 DONE**。草稿建立／複製、整週原子儲存、發布、員工個人週表與真實今日班表已完成；目前不要求門市。

## Next Recommended Task (P0)

開始 GPS／QR Punch foundation：

1. 建立 append-only Punch Record，保存 tenant、employee、work date、server/client timestamp、timezone、來源、裝置與 evidence。
2. 定義 GPS 同意、座標精度、geofence、定位失敗、mock location／重送與離線補送規則；QR token 必須短效且防重放。
3. 打卡 mutation 採 permission／身份檢查、idempotency key、database constraint 與 audit evidence，不允許直接 client table write。
4. 先完成 migration、rollback-only production integration test 與管理員可檢視的原始紀錄，再啟用首頁打卡按鈕。

排班 schema、正式班別、管理後台週表、員工個人週表與 RLS boundary 已完成；`012` production catalog 與 rollback-only 員工負向 RLS 三項驗證皆通過。
Production Database types、client generics 與 migration drift checks 已完成；重新產生使用 `npm run db:types`，執行時需要 read-only `SUPABASE_ACCESS_TOKEN`。

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
- 管理後台發布前完整性警示與 Holiday Calendar。
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
- 首頁班表與已排工時已是真實 published data；休假、出勤、打卡與通知目前尚未上線，UI 已明確標示，不能視為可操作功能。
- Payroll、保險、稅務、GPS 與 PII 屬高風險領域，需要專項驗收與法規審查。

## Definition of Done

功能只有在 code completed、相關 migration 已在受控環境驗證、API contract 同步、自動測試通過、tenant/security 影響已檢查且文件更新後才可標 DONE。靜態 UI、設計完成或列入 roadmap 均不算完整功能完成。
