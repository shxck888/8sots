# Architecture

Last Updated: 2026-08-25

本文件描述目前程式碼與已採用方向。Migrations `001`–`016` 已套用 Supabase production；未出現在 migration 的領域實體仍只是規劃。

## System Architecture

```text
Next.js 16 App Router / React 19 / Responsive PWA
        ↓ HTTPS
Vercel-hosted pages and Route Handlers
        ↓ authenticated, authorized, tenant-scoped access
Application / domain modules
        ↓ Supabase JS/SSR over HTTPS
Supabase Auth + PostgreSQL with RLS
```

原始碼以 GitHub 為部署來源。初期採 modular monolith：同一 Next.js 部署單元內保持清楚模組邊界；目前不建立 microservices。資料存取使用 Supabase client，不引入 ORM。兩個 server-side client 均套用 production-generated `Database` generic；背景工作與快取尚未選型，也尚未實作。

## Module Boundaries

- **Auth**：身分驗證、session/token 生命週期；不決定業務資料 scope。
- **Organization**：Tenant、Company、Location、Department、Position 與組織範圍。
- **Employee**：tenant-scoped 員工主檔拆分為 Employee、Profile、Contact 與 effective-dated Employment Record；另有 Department、Position、主管關係、私人照片、管理後台及受控 Employee/Auth Account 生命週期。
- **Schedule**：Shift、Shift Segment、排班及發布版本；不產生原始打卡。
- **Attendance**：Punch、工作日歸屬、考勤計算與異常；不自動核准加班。
- **Leave / Overtime**：第一版共用 Work Request 與單次 final Decision；額度、薪資認列、撤回與證明尚未實作。
- **Approval**：目前只有 request-specific 單層核准／拒絕；可配置流程、代理與多層步驟仍是後續模組。
- **Payroll / Insurance**：已建立有效日薪資、月結草稿、來源快照、人工調整、核對／鎖定與員工薪資單；未設定的保險、稅務及扣薪規則不自動套用，且不得反向修改考勤來源。
- **Notification / Report / Audit**：跨模組消費者；不得成為核心交易資料的唯一來源。

依賴原則：入口層 → 應用服務 → domain rules → data access。跨模組協作須透過穩定介面或事件，不直接修改其他模組的內部資料。

## Data Flow

1. 請求在入口完成 authentication、validation、permission 與 tenant scope 檢查。
2. 應用服務執行狀態轉移與 domain rules。
3. Repository/data-access 層在交易內寫入 PostgreSQL；關鍵操作同時建立 audit evidence。
4. 通知、報表或長時間批次工作未來由事件／job 觸發；具體 queue 尚未選定。

## Key Entity Groups

- Organization：Tenant → Company → Location / Department → Position
- Identity & people：User、Employee、Employee Profile/Contact、Employment Record、Department、Position、Role、Permission、Scope
- Scheduling：Shift → ordered Shift Segment；Schedule Version → per-employee/date Assignment。版本狀態為 draft/published/superseded，發布後保留不可變歷史。
- Attendance：Punch Record、Punch Correction、Attendance Day/Detail/Exception
- Absence：Leave Type/Grant/Balance/Request/Usage、Overtime、Comp Time
- Workflow：Approval Flow/Step/Request/Action
- Payroll：Salary Profile/Component、Payroll Period/Employee/Item/Adjustment/Snapshot、Payslip
- Compliance：Insurance/Tax Rule Version、Enrollment、Holiday/Calendar
- Platform：Announcement、Notification、Attachment、Audit Log、System Setting

Foundation migrations 已定義 Tenant、Tenant Membership、Company、Location、Role、Permission、Role Permission、Membership Role 與 Audit Log。`004`–`009` 建立 Employee Master、私人照片及受控帳號生命週期。`010`–`012` 建立版本化排班與員工本人 published-only 讀取。`013` 建立 Punch Record：正式時間由 PostgreSQL `statement_timestamp()` 產生，client time、timezone、GPS 與同意時間保存為 evidence；同員工使用 transaction advisory lock 與 idempotency key 防止競態／重送，原始紀錄由 trigger 禁止 update/delete。

`014` 將 Attendance 計算建模為 immutable-by-version snapshot：每次 `calculate_attendance` 建立 Calculation Run，再產生 Day、Segment 與 Exception rows，綁定當時 Rule Set、published Assignment、原始 Punch 及已核准 Correction。更正 Request 與 Decision 分表且決策只新增一次；核准不修改 Punch，只會在下一次重算時加入 effective event stream。

`015` 建立 navigation read model：`get_current_workspace_context` 一次解析 Auth identity、active tenant、Employee link 與管理權限；`get_my_published_schedule` 一次回傳指定期間最新版 published assignment 與 segments；`get_my_attendance_overview` 一次回傳個人 Punch、Attendance Day 與 Correction/Decision。`016` 擴充 workspace read model 為四項管理權限，並建立 tenant-scoped `leave_types`、`work_requests`、`work_request_decisions`。Work Request 本體不提供 client write，單一 final Decision 以 unique constraint 保證不可重複審核；建立與審核都由 identity/permission-checked RPC 同交易寫入 Audit Log。

## Multi-Tenant Strategy

Tenant 是最高資料隔離邊界。業務資料攜帶 `tenant_id`，下層 foreign key 同時包含 tenant key以阻擋跨租戶關聯。Authenticated client 沒有業務表直接 write privilege；Schedule Assignment 限制一般員工只能讀自己的 published rows，Punch 與 Work Request 限制本人或具對應管理權限者讀取。Mutation 採 Server Action → identity/permission-checked security-definer RPC → domain row/Audit Log 同步寫入。Supabase Auth Admin 操作只能由 server-only service-role client 執行。

## Authentication and Authorization

認證採 Supabase Auth。使用者輸入 3–32 位英數／底線自訂帳號，server 將正規化後的帳號映射成 `{username}@auth.8sots.com.tw` 作為 Supabase 內部 email identifier。員工帳號由 Auth Admin API 建立／更新，並透過 `employees.auth_user_id`、`employee_auth_accounts` 與 active `tenant_memberships` 連結；建立帳號不自動授予管理角色。授權採 RBAC + scope；管理後台在 layout、Server Action 及 database RPC 驗證各模組 permission（目前 `employee.manage`、`schedule.manage`、`attendance.manage`、`request.manage`），`platform.admin` 可覆蓋。停用／恢復採 Auth ban 與 DB 狀態同步，跨系統失敗使用補償動作；application 與 database 皆防止操作者停用自己。第二 tenant 的負向 RLS integration test 已在 production 以 rollback-only fixture 通過。

## Data Conventions

- 後端時間基準為 UTC，DB 使用具時區語意的 timestamp；任職 effective date 依 tenant timezone 計算，UI 預設 `Asia/Taipei`。
- 排班與考勤另保存 local work date/timezone，支援跨午夜。
- 工時／休息時間使用整數分鐘。
- Shift segment 以 work date 起點的 minute offset 表示：開始為 `0..1439`，結束可至 `2880`，因此可跨午夜；班段不可重疊。
- 海之星目前的 `WEEKDAY_SPLIT` 為 `600–840`、`960–1260`，`HOLIDAY_CONTINUOUS` 為 `600–1260`。是否屬假日由排班指派決定，尚未接上 holiday calendar。
- 金額採精確型別（PostgreSQL `numeric` 或整數最小單位），選擇待 Schema ADR。
- 重要歷史狀態使用 immutable record、effective dating 或 snapshot，使重算可追溯。
- 一般主檔傾向 soft delete；依法或業務要求不可刪除的交易紀錄採保留／封存。
- Punch 的 `occurred_at` 為正式 server time；`client_occurred_at` 只接受 server 前 10 分鐘至後 5 分鐘，GPS 誤差上限 1000 m。未建立 Location/geofence 時一律保存為 `not_configured`，不能視為到店驗證。
- Attendance Rule V1 的遲到／早退寬限均為 0 分鐘，只標記相對排班差異，不自動扣薪、不認列加班。每個 Shift Segment 依序配對第 N 筆有效上／下班事件；缺卡、多餘卡與未排班打卡建立 Exception。
- Work Request 以 tenant timezone 將 local 起訖時間轉為 UTC，工時保存整數分鐘；申請範圍為過去 62 天至未來 366 天、單筆最長 31 天。初始假別為事假、病假、特別休假、其他，只作分類，不計算額度或薪資效果。

## Infrastructure

- **Implemented locally**：Next.js 16、React 19、TypeScript、Supabase JS/SSR、Zod、ESLint、Vitest、PWA manifest、environment template。
- **Typed data boundary**：`lib/database.types.ts` 以 production schema 為基線並同步已驗證的 `016` schema；`lib/database.ts` 只覆蓋 generator 無法推斷的 Employee Master nullable function arguments。Migration contract test 會檢查所有 PostgREST-visible versioned table/function/enum；trigger functions 不屬 Data API surface。
- **Request data boundary**：Next.js Proxy 使用 `getClaims()` 驗證本地 JWT（必要時由 Supabase client 處理 refresh），不在每次 route navigation 額外呼叫遠端 `getUser()`。server-only DAL 以 `get_current_workspace_context` 集中解析 session、active membership、四項管理權限與 Auth-linked Employee；React `cache()` 僅在單次 render/request 去除 Layout 與 Page 重複查詢，不跨使用者或跨請求保存授權結果。
- **Navigation feedback**：動態 employee/admin route 以 `loading.tsx` 建立 Suspense 邊界，提供可預取的即時載入狀態；Shared Layout 保持可互動，實際資料仍由 server-authoritative 查詢完成後替換。
- **Attendance evidence UI**：管理員列表只呈現最新 Calculation Run 摘要；`/admin/attendance/[dayId]` 依 tenant-scoped Day 讀取該快照的 Segment、Exception、原始 Punch 與 Correction。核准補卡不直接改快照，若 Decision 晚於最新 Run 則管理頁標示需要重算。
- **Accepted hosting/data**：GitHub、Vercel、Supabase Auth/PostgreSQL；Supabase primary region 為 Tokyo (`ap-northeast-1`)。
- **Compute locality**：`vercel.json` 將 Vercel Functions 固定於 Tokyo `hnd1`，使 server-rendered page、Server Action 與 Supabase PostgreSQL 位於同一 AWS region；靜態 asset 仍由 Vercel CDN 就近提供。
- **Selected**：Supabase Storage 私人 bucket 保存員工照片，3 MB，僅 JPEG/PNG/WebP；由短效 signed URL 顯示。
- **Selected**：Vercel Sensitive `SUPABASE_SERVICE_ROLE_KEY` 僅供 server-only Auth Admin client 使用，不得使用 `NEXT_PUBLIC_` 前綴或傳入 client bundle。
- **Not yet selected**：queue、cache、observability、preview/production environment topology。
- GitHub source 位於 `shxck888/8sots/hrms`；Vercel project、custom domain、Supabase production project 與 migrations 已建立。`supabase/tests/cross_tenant_rls.sql` 已驗證 production RLS/grant/RPC/composite-FK 隔離並 rollback fixture；備份／還原驗證與獨立 CI workflow 尚未完成。

## Current API Surface

- `GET /api/health`：無外部依賴的服務 liveness，回傳 `status/service/timestamp`。
- `GET /api/v1/me`：以 Supabase Auth 取得使用者並回傳 active tenant memberships；未登入為 `401`，環境未設定為 `503`。
- `GET /login`：登入頁；已登入者 server-side redirect 至 `/`。
- Login/logout Server Actions：驗證自訂帳號與密碼、將帳號映射為內部 Supabase identifier、建立或清除 session cookie；不直接暴露 Supabase 原始錯誤。
- `/admin/employees`、`/new`、`/[id]`：permission-protected 員工列表、搜尋、新增與編輯 UI。
- Employee Server Actions：Zod validation 後呼叫 `create_employee_master` / `update_employee_master` / `set_employee_photo`；RPC 在 database 重新驗證權限並寫入 audit evidence。照片寫入私人 Storage bucket。
- Employee Account Server Actions：以 server-only Auth Admin API 建立帳號／重設密碼／ban 或 unban，並呼叫 `link_employee_auth_account`、`set_employee_auth_account_status`、`record_employee_password_reset` 同步資料與 audit；不是公開 JSON API。
- Schedule database RPC：`upsert_shift_template`、`create_schedule_draft`、`assign_schedule_shift`、`save_schedule_assignments`、`publish_schedule`。皆要求 `schedule.manage`、驗證 tenant 並寫入 Audit Log；不是公開 JSON API。
- `POST` Server Actions under `/admin/schedules`：建立草稿、呼叫 `save_schedule_assignments` 儲存整週、發布班表；每個 action 都重新取得 `schedule.manage` admin context，亦非公開 JSON API。
- `GET /` 與 `GET /my-schedule?week=YYYY-MM-DD`：server-rendered 員工工作台與個人週班表；以登入者 `auth_user_id` 對應 Employee，application 僅查 published versions，RLS 再限制 Assignment 為本人 published rows（管理員例外）。
- GPS Punch Server Action：只接受完整且已同意的 browser geolocation evidence，tenant 與 user 從 server session 解析後呼叫 `record_gps_punch`；不是公開 JSON API。
- `GET /attendance` 與 `GET /admin/attendance`：員工本人紀錄及 `attendance.manage` tenant 原始證據唯讀頁。
- Attendance Server Actions：員工呼叫 `request_punch_correction` 提出 62 天內補卡；管理員呼叫 `decide_punch_correction` 審核，並以 `calculate_attendance` 建立最多 32 天的新快照。所有 Action 都重新解析 server session 與權限。
- `GET /requests` 與 `/admin/requests`：已連結員工提出／查詢請假與加班，`request.manage` 管理員審核；`create_work_request`、`decide_work_request` 為內部 audited RPC，不是公開 JSON API。
- `createServerClient<Database>` 與 `createClient<Database>`：所有 `.from()`／`.rpc()` 從 production schema 取得 table、view、enum、relationship 與 function argument inference。
- `GET /auth/callback?code=...`：交換 Supabase PKCE code，並限制 `next` 只能是站內路徑。
- API error 採 `{ error: { code, message } }` 基線。業務 API 尚未建立。

## Security Baseline

必須納入 tenant isolation、least privilege、secure cookies/CSRF、rate limiting、輸入驗證、PII/銀行資料保護、secret management、audit log 及 HTTPS。目前身分證以 server-only AES-256-GCM 加密、HMAC-SHA256 hash 做唯一查找、UI 僅顯示末四碼；照片為私人 bucket。密碼只交由 Supabase Auth 處理，不保存於業務資料或 audit。另有 tenant composite keys、RLS read isolation、無 client table writes、audited permission checks、自我停用防護及 Auth/DB 跨系統補償；跨租戶核心隔離已完成 production 負向測試，rate limiting、CSP 與備份還原等控制仍待實作或驗證。
