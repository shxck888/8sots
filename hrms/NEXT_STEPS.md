# Next Steps

Last Updated: 2026-08-26

## Current Phase

**請假／加班申請第二版與三項 Phase 1 收尾功能已完成 production migration、部署與 smoke test**。`017` 撤回／年度額度／核准後出勤快照、`018` Holiday Calendar、`019` 出勤規則管理、`020` 請假／加班附件證明均已套用 production；`hrms.8sots.com.tw` 已部署包含新管理頁的版本。Rule Set V2 已依使用者決策設為遲到／早退 0 分鐘寬限，自 2026-08-26 生效並留下 audit record。`hs001` 已確認 Employee、登入帳號與 membership 均為 active；仍需由使用者在真實手機完成 GPS 與申請流程操作驗收。

## Next Recommended Task (P0)

完成 `hs001` 真實 Employee operational acceptance：

1. 由使用者以 `hs001` 在真實手機完成 GPS 打卡 → 缺卡 → 補卡 → 管理員核准 → 重算 E2E。
2. 以 `hs001` 驗收請假／加班／撤回／額度／附件與出勤異常標記；不得為驗收建立永久假資料。
3. 取得使用者確認的缺卡配對、未排班打卡、多餘卡等剩餘規則；Rule Set V2 的遲到／早退寬限已完成。

## 本 session 已完成並套用 production

- `018` Holiday Calendar：`holiday_calendar_entries`、`holiday_kind` enum、`upsert_holiday_entry`／`delete_holiday_entry` audited RPC、tenant RLS、`/admin/holidays` 管理頁；排班頁發布前依假日曆與排班狀態提示（整週未排、員工整週無班、國定假日仍排班、補班日未排）。
- `019` 出勤規則管理：`create_attendance_rule_set`（版本化、`attendance.manage`、audited），`/admin/attendance-rules` 頁可填遲到／早退寬限與生效日並建立新版；`calculate_attendance` 依 `effective_from desc, version desc` 選用，故新版自動生效。
- `020` 請假／加班附件證明：`work_request_attachments` 表、私人 Storage bucket `work-request-proofs`（本人上傳、`request.manage` 讀取的 storage policy）、`attach_work_request_proof` audited RPC、`leave_types.requires_proof`（病假預設 true）；員工於 `/requests` 為待審申請上傳證明，管理員於 `/admin/requests` 以短效簽名網址下載。

## Pending Priorities

### P0 — Attendance correctness and operations

- `hs001` 真實手機 operational acceptance；`017`–`020` 已完成 production schema 與頁面驗證。
- Rule Set V2 已建立為 0／0 分鐘並於 2026-08-26 生效；不得把 Attendance 差異直接當成薪資扣款。
- Correction 審核後通知與批次重算操作權限；GPS consent 保存政策、mock-location 風險、CSP／security headers、rate limit 與 audit writer 強化。
- 建立 production Server Timing／p95 navigation 監測。

### P1 — Phase 1 completion（剩餘皆需使用者這邊配合）

- 密碼復原、邀請、MFA 與非 Email 帳號綁定政策：需 Supabase Auth 後台設定與政策決定。
- 建立 Company／Location 管理後才設定 geofence：需門市清單與座標範圍。
- QR 短效 token、防重放與裝置／離線補送規則：需 token TTL 與裝置綁定決策。
- （已完成 production，待真實員工操作驗收）請假／加班附件證明、假別額度與撤回、核准後 Attendance snapshot、Holiday Calendar 與發布前警示、出勤規則版本化機制。
- （已決定不做）可配置多層 Approval 與代理人：維持單層審核。

### P2 — Subsequent phases

- Salary、Payroll、Insurance、Payslip 與背景 job。
- Notification、Report、Labor Cost、Revenue integration 與進階 rule engine。

## Decisions Needed

- 已決定：請假／加班維持單層審核。
- 已決定：遲到／早退均無寬限，Rule Set V2 自 2026-08-26 生效；`hs001` 為真實驗收 Employee；已授權並套用 `017`–`020`。
- 待決定：缺卡配對容錯；各假別額度、生效日、證明要求、最小申請單位、跨日計算、加班認列與補休／加班費政策；門市與 geofence 資料；QR／離線規則；Preview／production 拓撲、Tokyo failover 與 secret rotation。

## Known Issues / Risks

- `017`–`020` 已完成 production 驗證；真實手機 GPS、附件上傳、撤回與審核 E2E 仍需 `hs001` 實際操作。
- `lib/database.types.ts` 已手動補上 `018`／`019`／`020`；本機缺少 Supabase access token，尚未用 `npm run db:types` 由 production schema 重新產生。
- Rule V2 的 0／0 分鐘是使用者確認的海之星政策，自 2026-08-26 生效；V1 保留為歷史技術基線。
- 尚無 Location/geofence；GPS 只保存 evidence。
- Docker/Supabase local stack 不可用；真實 database integration tests 需在受控遠端 transaction 執行。
- 使用者本機 device 執行環境於 2026-08-25 啟動失敗；本 session 的驗證改在雲端容器進行。

## Definition of Done

功能只有在 code completed、migration 受控驗證並正式套用、API contract 同步、自動測試通過、tenant/security 影響檢查、production deployment/smoke test 與文件更新後才可標 DONE。靜態 UI 或 roadmap 不算完成。
