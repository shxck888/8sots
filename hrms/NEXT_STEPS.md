# Next Steps

Last Updated: 2026-08-25

## Current Phase

**請假／加班申請中心第一版 DONE**。`016` migration、employee/admin UI、100 項測試、Vercel deployment 與正式管理頁 smoke test 已完成。Request 與 final Decision 分離；四種初始假別只分類，不計算額度、扣薪、加班費或補休。

## Next Recommended Task (P0)

完成真實 Employee operational acceptance：

1. 由使用者指定一位真實 Employee 並確認是否建立／連結登入帳號，完成手機 GPS 打卡 → 缺卡 → 補卡 → 核准 → 重算 E2E；不得自行建立永久帳號。
2. 與使用者確認遲到／早退寬限、未排班打卡、跨日與多餘卡的正式規則，再建立 Rule Set V2，不覆寫 V1。
3. 使用同一已連結 Employee 提出請假及加班，由管理員核准／拒絕並確認員工狀態更新；不得使用未經授權的永久測試帳號或申請。

## Pending Priorities

### P0 — Attendance correctness and operations

- 真實已連結員工的手機 operational acceptance；production UI deployment 與管理員 smoke test 已完成。
- Rule Set V2 業務參數與生效日；不得把 Attendance 差異直接當成薪資扣款。
- Correction 審核後通知與批次重算操作權限；受影響日期提醒及管理端 Segment evidence 明細已完成。
- GPS consent 保存政策、mock-location 風險、CSP/security headers、rate limit 與 audit writer 強化。
- 建立 production Server Timing／p95 navigation 監測，量測 `015` aggregate RPC 上線後的實際手機切頁時間；若管理頁仍超標，再針對員工列表、週排班與管理出勤建立獨立 read model。

### P1 — Phase 1 completion

- 請假／加班撤回、附件／證明、假別額度、核准後 Attendance 銜接，以及可配置多層 Approval；基本送單與單層審核已完成。
- Holiday Calendar 與排班發布前完整性警示。
- Password recovery、invitation、MFA 與非 Email 帳號綁定政策。
- 建立 Company／Location 管理後才設定 geofence；目前無需門市且不得宣稱到店驗證。
- QR 短效 token、防重放與裝置／離線補送規則。

### P2 — Subsequent phases

- Salary、Payroll、Insurance、Payslip 與背景 job。
- Notification、Report、Labor Cost、Revenue integration 與進階 rule engine。

## Decisions Needed

- 遲到／早退寬限分鐘、缺卡配對容錯、未排班打卡與多餘卡處理方式。
- 補卡是否只允許最近 62 天、核准層級與是否需要員工撤回功能。
- 各假別額度、生效日、證明要求、最小申請單位、跨日計算、加班認列與補休／加班費政策；目前不得從單層核准直接推導薪資結果。
- Preview/production 拓撲、Tokyo region failover 與 secret rotation。
- 金額表示、background job/queue、cache、observability 與公開 API conventions。

## Known Issues / Risks

- Production 尚無經使用者授權的已連結 Employee 驗收帳號；Database 流程已用 rollback-only fixture 驗證。
- `admin` 沒有連結 Employee，因此 production 只完成管理員申請頁 smoke test；員工送單與審核 E2E 仍待使用者指定真實員工帳號。
- Rule V1 寬限為 0 分鐘，屬技術基線而非確認過的海之星人事政策。
- Attendance 計算配對第 N 筆上班與第 N 筆下班；極端亂序／誤打仍需人工更正與後續規則強化。
- 尚無 Location/geofence；GPS 只保存 evidence。
- Docker/Supabase local stack 不可用；真實 database integration tests 在受控遠端 transaction 執行。
- 一般員工頁已移除主要串行查詢，但尚無正式 p50/p95 telemetry；不能只用單一手機體感宣稱效能目標完成。

## Definition of Done

功能只有在 code completed、migration 受控驗證並正式套用、API contract 同步、自動測試通過、tenant/security 影響檢查、production deployment/smoke test 與文件更新後才可標 DONE。靜態 UI 或 roadmap 不算完成。
