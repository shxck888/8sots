# Next Steps

Last Updated: 2026-08-25

## Current Phase

**Build 1 的登入、Employee Master、版本化排班與 GPS 原始打卡第一版 DONE**。Punch Record 使用伺服器時間、明確定位同意、idempotency 與 append-only 保護；員工只看自己，`attendance.manage` 管理員可看 tenant 原始證據。海之星尚未建立門市，因此 geofence 顯示 `not_configured`，QR 尚未啟用。

## Next Recommended Task (P0)

建立可重現的 Attendance Day 計算與 Punch Correction foundation：

1. 由 published Schedule + immutable Punch Records 產生每日出勤明細，不修改原始 Punch。
2. 定義兩段班的配對、跨日 work date、缺卡、遲到、早退、超時與未排班打卡規則；計算規則必須版本化。
3. 建立獨立 Punch Correction 申請／核准／套用紀錄，保留原值、建議值、原因、操作者與 audit evidence。
4. 先完成 migration、permission/RLS、rollback-only production integration tests 與管理員唯讀異常清單，再製作員工申請 UI。

## Pending Priorities

### P0 — Attendance correctness and security

- Attendance Day／Detail／Exception 可重現計算與規則版本。
- Punch Correction 獨立紀錄與基本簽核邊界。
- GPS consent 保存政策、mock-location 風險、CSP/security headers、rate limit 與 audit writer 強化。
- 每次 GitHub commit 的 Vercel production、custom-domain TLS 與 migration ownership/backup/restore 驗證。

### P1 — Phase 1 completion

- 建立 Company／Location 管理後，再設定店址座標、半徑與 geofence；在此之前不得標示到店驗證通過。
- QR 短效 token、防重放與裝置／離線補送規則。
- Holiday Calendar 與排班發布前完整性警示。
- Password recovery、invitation、MFA 與非 Email 帳號綁定政策。
- Organization CRUD、Phase 1 permission matrix 與完整 audit trail。

### P2 — Subsequent phases

- Leave、Overtime、Approval、Comp Time。
- Salary、Payroll、Insurance、Payslip 與背景 job。
- Notification、Report、Labor Cost、Revenue integration 與進階 rule engine。

## Decisions Needed

- 兩段班中間休息與缺卡配對的容錯窗口，以及未排班打卡的處理規則。
- Punch Correction 的核准層級、可追溯套用方式與員工可見範圍。
- Vercel function region 及 preview/production 環境拓撲。
- PostgreSQL 金額表示、background job/queue、cache、observability 與公開 API conventions。

## Known Issues / Risks

- Production 目前沒有可供正式 GPS 打卡驗收的已連結 Employee 帳號；database RPC 已用 rollback-only Auth/Employee fixture 驗證，UI 只完成未連結狀態 smoke 前置條件。
- 尚無 Location/geofence；GPS 座標目前只保存為 evidence，不能判定是否到店。
- 打卡交替可支援兩段班，但尚未計算工時、遲到、早退、缺卡或加班。
- Docker/Supabase local stack 不可用；真實 database integration tests 必須在受控遠端 transaction 中執行。
- Payroll、保險、稅務、GPS 與 PII 屬高風險領域，需要專項驗收與法規審查。

## Definition of Done

功能只有在 code completed、migration 受控驗證並正式套用、API contract 同步、自動測試通過、tenant/security 影響檢查、production deployment/smoke test 與文件更新後才可標 DONE。靜態 UI 或 roadmap 不算完成。
