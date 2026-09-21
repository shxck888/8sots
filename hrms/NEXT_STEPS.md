# Next Steps

Last Updated: 2026-09-21

## 2026-09-21 completion update

Production migrations `029`–`031` are applied. Administrators can now create effective-dated workplace/geofence and payroll-cycle settings from `/admin/settings`; settings are immutable versions with audit evidence. Payroll calculation now uses real Employee Master fields and only the latest attendance snapshot per work date, supports monthly/hourly compensation versions, preserves manual adjustments on recalculation, requires an explicit review note, prevents empty or incomplete payroll from being locked, and exposes only locked self payslips without recursive RLS. `/admin/audit` provides permission-checked audit history. Database rate limits and response security headers are also enabled.

Production migration `032` is applied. Signed-in administrators can change their own password from `/admin/account`; the workflow verifies the current password, records a password-free audit event, revokes all sessions and returns to login. A fully forgotten administrator password still requires operator-assisted recovery because the internal Auth email address is not a deliverable mailbox.

Production migrations `033`–`034` are applied. The in-app notification center now covers request/correction creation and decisions, request withdrawal, schedule publication and locked-payslip publication. Payroll now uses effective-dated statutory rules, employee insurance/tax profiles and leave-pay ratios to calculate approved overtime, leave deductions or paid leave, labor/employment/health insurance, voluntary pension and configured income-tax withholding. Missing versions become explicit blockers and prevent review/lock.

Production migration `035` is applied. Anniversary-based statutory annual leave is generated from each employee's hire date, deducted only after approval, protected from over-approval, and retained as grant/usage/adjustment history. Employees can see their balance and expiry in `/requests`; managers can configure the effective date and standard-day minutes in `/admin/settings`, then inspect or sync all employee balances in `/admin/requests`. Expired unused grants are marked pending settlement for payroll review; automatic cash-out posting is not yet enabled.

Production migration `036` is applied. Employee records now support audited archive/restore lifecycle management. Archiving terminates and hides the employee from current operational lists while suspending the linked account and membership. Permanent deletion is limited to archived records with no retained schedule, punch, attendance, request, payroll, statutory, annual-leave, supervisor or management-role history and requires explicit employee-number confirmation.

No workplace coordinates, insurance brackets, withholding amounts or legal rates were invented. Administrators must create the applicable versions in `/admin/settings` and `/admin/payroll`; locked periods preserve the versions and snapshots used.

## Current Phase

**請假／加班申請第二版與三項 Phase 1 收尾功能已完成 production migration、部署與 smoke test**。`017` 撤回／年度額度／核准後出勤快照、`018` Holiday Calendar、`019` 出勤規則管理、`020` 請假／加班附件證明均已套用 production；`hrms.8sots.com.tw` 已部署包含新管理頁的版本。Rule Set V2 已依使用者決策設為遲到／早退 0 分鐘寬限，自 2026-08-26 生效並留下 audit record。`hs001` 已確認 Employee、登入帳號與 membership 均為 active；仍需由使用者在真實手機完成 GPS 與申請流程操作驗收。

## Next Recommended Task (P0)

完成 `hs001` 真實 Employee operational acceptance 與正式薪資參數建檔：

1. 由使用者以 `hs001` 在真實手機完成 GPS 打卡 → 缺卡 → 補卡 → 管理員核准 → 重算 E2E。
2. 以 `hs001` 驗收請假／加班／撤回／額度／附件與出勤異常標記；不得為驗收建立永久假資料。
3. 取得使用者確認的缺卡配對、未排班打卡、多餘卡等剩餘規則；Rule Set V2 的遲到／早退寬限已完成。
4. 由管理員在 `/admin/settings` 建立週年制特休版本（海之星一般八小時工作日可填 480 分鐘），並依正式投保級距與公司適用法規建立法定薪資版本、每位員工投保／扣繳版本及各假別給薪比例，再以一個測試月份核對後鎖定。

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

- 員工自助忘記密碼已決定不做；員工忘記密碼時聯絡主管，由具 `employee.manage` 權限者在員工帳號管理重設。管理員可在登入後自行變更密碼，完全遺失時維持 operator-assisted recovery。邀請與 MFA 僅在未來有需求時再評估。
- 建立 Company／Location 管理後才設定 geofence：需門市清單與座標範圍。
- QR 短效 token、防重放與裝置／離線補送規則：需 token TTL 與裝置綁定決策。
- （已完成 production，待真實員工操作驗收）請假／加班附件證明、假別額度與撤回、核准後 Attendance snapshot、Holiday Calendar 與發布前警示、出勤規則版本化機制。
- （已決定不做）可配置多層 Approval 與代理人：維持單層審核。

### P2 — Subsequent phases

- 薪資草稿、法定扣款連動、Payslip 與站內通知已完成；後續為週期性背景工作、申報檔／報表與薪資批次匯出。
- Report、Labor Cost、Revenue integration 與進階 rule engine。

## Decisions Needed

- 已決定：請假／加班維持單層審核。
- 已決定：不提供員工自助忘記密碼流程；由主管在後台重設，避免以身分證等固定個資作為唯一復原憑證。
- 已決定：遲到／早退均無寬限，Rule Set V2 自 2026-08-26 生效；`hs001` 為真實驗收 Employee；已授權並套用 `017`–`020`。
- 待決定：缺卡配對容錯；各假別額度、生效日、證明要求、最小申請單位、跨日計算、加班認列與補休／加班費政策；門市與 geofence 資料；QR／離線規則；Preview／production 拓撲、Tokyo failover 與 secret rotation。

## Known Issues / Risks

- `017`–`020` 已完成 production 驗證；真實手機 GPS、附件上傳、撤回與審核 E2E 仍需 `hs001` 實際操作。
- `lib/database.types.ts` 已由套用 `036` 後的 production schema 重新產生。
- 到期未休特休目前會進入「待結清」台帳，不會自行產生薪資加項；需在實際薪資流程核對並以人工調整結清，之後可再補自動折算與結清憑證。
- Rule V2 的 0／0 分鐘是使用者確認的海之星政策，自 2026-08-26 生效；V1 保留為歷史技術基線。
- 尚無 Location/geofence；GPS 只保存 evidence。
- Docker/Supabase local stack不再是 migration 驗證的必要條件；PGlite 會依序實際套用全部 migration 並測試關鍵工作流，production migration 仍由 Supabase CLI 受控套用。
- 使用者本機 device 執行環境於 2026-08-25 啟動失敗；本 session 的驗證改在雲端容器進行。

## Definition of Done

功能只有在 code completed、migration 受控驗證並正式套用、API contract 同步、自動測試通過、tenant/security 影響檢查、production deployment/smoke test 與文件更新後才可標 DONE。靜態 UI 或 roadmap 不算完成。
