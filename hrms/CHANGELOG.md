# Changelog

本檔只記錄實際完成的變更，不將規劃中的產品功能列為 Added。

## 2026-08-25

### Added

- 新增 Supabase email/password 登入頁、表單 validation 與安全的站內 `next` redirect。
- 新增登入／登出 Server Actions、PKCE Auth callback 與 Next.js Proxy session refresh。
- 首頁改為需要有效 session，並顯示真實使用者 email、顯示名稱及第一筆 active tenant membership。
- 新增 Auth validation、redirect 與 user display name tests。
- 新增自訂帳號驗證及 `{username}@auth.8sots.com.tw` 內部 Supabase identifier 映射。
- 新增 ADR-013，記錄自訂帳號與 Supabase Auth 的整合方式。
- 建立首位 production 管理員 `admin`、`8sots` tenant、active membership、`platform_admin` role、`platform.admin` permission 與 bootstrap audit record。
- 新增 `202608250003_platform_admin_permission.sql`，將全域管理員 permission reference data 納入版本控制。
- 已在 Supabase production migration history 確認 `202608250003 platform_admin_permission` 套用成功。
- 新增管理後台與員工列表、搜尋、新增及編輯頁面。
- 新增員工資料 Zod validation、狀態標籤與 11 項相關 unit/contract tests。
- 新增 ADR-014，記錄 permission-checked audited employee RPC 架構。
- 新增完整 Employee Master：身分證、生日、性別、地址、照片、緊急聯絡人、部門、職位、主管、任職類型、離職日期與試用期。
- 新增 ADR-015，記錄 Employee Master 正規化、PII 加密、私人照片與 tenant timezone 生效日。
- 新增員工登入帳號管理：建立自訂帳號、重設密碼、停用及恢復登入。
- 新增 ADR-016，記錄 server-only Auth Admin boundary、Employee/Auth link、跨系統補償與自我停用防護。
- 新增 `supabase/tests/cross_tenant_rls.sql` 與執行 runbook，提供 rollback-only 第二 tenant 安全 fixture。
- 從 Supabase production schema 產生完整 `lib/database.types.ts`，涵蓋 tables、Employee Master view、RPCs、enums 與 relationships。
- 新增 application `Database` overlay，僅修正 generator 無法表達的 Employee Master nullable PostgreSQL function arguments。
- 新增 migration-to-types drift tests，並加入 `npm run db:types` 再生指令。
- 新增 tenant-wide Shift、ordered Shift Segment、Schedule Version 與 Schedule Assignment foundation。
- 新增海之星正式平日班（10:00–14:00、16:00–21:00）與假日班（10:00–21:00）。
- 新增 `supabase/tests/schedule_foundation.sql`，以 rollback-only production test 驗證工時、跨日、重疊、跨租戶、發布與 immutable history。
- 新增 ADR-017，記錄版本化班表與已發布班別／指派不可變決策。
- 新增管理後台週排班頁：週切換、版本摘要、員工七日班別表格、建立／複製草稿、儲存與發布。
- 新增 `lib/schedules.ts` 日期、跨日時間顯示與 assignment 表單 parser，以及 7 項 unit tests。
- 新增員工端 `/my-schedule` 週班表、週切換、班段／週工時、未排班與未連結員工空狀態。
- 新增共用員工 Workspace Shell 與 published schedule server data service；首頁今日班表與本月排班時數改讀真實資料。
- 新增 ADR-018，記錄員工只能讀自己的已發布班表。

### Changed

- 未登入存取 `/` 現在會 `307` 導向 `/login`；已登入存取 `/login` 會導向 `/`。
- 專案文件同步為已完成 Supabase migrations、Vercel environment/custom domain 的實際狀態。
- 登入欄位由 Email 改為 3–32 位英數／底線帳號；密碼規則改為 6–64 位英數混合。
- 修正 Vercel Supabase environment variables 的空值與被截短 publishable key，重新部署 production。
- 員工首頁移除代表性班表、GPS、出勤與休假假資料；尚未上線的功能改為 disabled／明確狀態。

### Database

- 新增 idempotent reference-data migration `202608250003_platform_admin_permission.sql`；無 table/schema breaking change。
- Production 已建立 `8sots` tenant、管理員 membership/RBAC 關聯及 audit record；不將環境特定 Auth user UUID 寫入 migration。
- 新增並套用 `202608250004_employee_management.sql`：Employee table、`employee_status`、`employee.manage` permission、permission evaluator、audited create/update RPC 與 tenant RLS。
- Employee table 僅授予 authenticated SELECT；新增／修改只能執行明確 grant 的 permission-checked RPC，無 delete 或直接 client write。
- 新增並套用 forward-fix `202608250005_employee_auth_link_unique_fix.sql`，允許多位尚未連結 Auth User 的員工，同時維持非空 `auth_user_id` 的 tenant 內唯一性。
- 新增 `202608250006_employee_master_details.sql`：Department、Position、Employee Profile/Contact、effective-dated Employment Record、完整 Employee Master RPC、RLS、audit 與私人 `employee-photos` bucket。
- 新增 forward-fix `202608250007_employment_effective_date_timezone_fix.sql`，任職異動依 tenant timezone 產生生效日，避免 UTC 日期邊界建立無效區間。
- Supabase production migration history 已確認 `202608250006` 與 `202608250007` 套用成功。
- 新增並套用 `202608250008_employee_auth_accounts.sql`：`employee_auth_accounts`、Auth link、active membership 同步、帳號狀態／密碼重設 audited RPC 與最小 SELECT grant。
- 新增並套用 forward-fix `202608250009_prevent_self_account_suspension.sql`：database RPC 拒絕操作者停用或變更自己的帳號狀態。
- 新增並套用 `202608250010_schedule_foundation.sql`：`shifts`、`shift_segments`、`schedule_versions`、`schedule_assignments`、`schedule_version_status`、`schedule.manage`、tenant RLS、composite tenant FKs、immutable triggers 與 audited RPC。
- 新增 environment seed `8sots_schedule_templates.sql`；正式資料為 `WEEKDAY_SPLIT` 540 分鐘與 `HOLIDAY_CONTINUOUS` 660 分鐘。
- 新增並套用 `202608250011_schedule_batch_save.sql`：同期間單一 draft index、published → draft assignment copy 與 `save_schedule_assignments` 原子批次 RPC。
- 新增並套用 `202608250012_employee_schedule_visibility.sql`：一般員工只能 SELECT 自己的 published schedule assignments，`schedule.manage` 管理員保留 tenant-scoped 管理讀取；無 schema 或資料 breaking change。

### API

- 新增 `GET /auth/callback`；既有 JSON API contract 無 breaking change。
- 新增員工管理 Server Actions 與 database RPC；既有 JSON API 無變更。
- Employee Server Action/RPC contract 擴充為完整 Employee Master；舊的內部簡版表單 contract 被取代，公開 JSON API 無 breaking change。
- 新增內部 Employee Account Server Actions；既有公開 JSON API 無新增、變更或 breaking change。
- 新增內部 Schedule database RPC：班別 upsert、建立草稿、指派員工班別及發布；尚未建立 UI，既有公開 JSON API 無 breaking change。
- 新增 `/admin/schedules` Server Actions：建立草稿、整週儲存與發布；既有公開 JSON API 無 breaking change。
- 新增 server-rendered `GET /my-schedule` 與首頁 published schedule read；既有公開 JSON API 無變更。

### Breaking Changes

- 首頁不再允許匿名瀏覽；這是預期的 authentication boundary 變更。
- 登入識別由 Email 改為自訂帳號；原 Email 不能直接填入新登入欄位。

### Validation

- 本機 production HTTP smoke test：`/` 回傳 `307` 至 `/login`、`/login` 回傳 `200`、`/api/health` 回傳 `200`。
- Production `admin` 登入、tenant 顯示、登出與 RBAC bootstrap 查詢通過；跨租戶負向 RLS 測試仍未完成。
- ESLint、TypeScript、51 個 Vitest tests 與 Next.js production build 通過。
- Production 管理後台列表／表單 render、console、migration history 與 transaction-scoped create/update/rollback 驗證通過；沒有留下測試員工資料。
- 完整 Employee Master production transaction 新增／修改／查詢／rollback 通過；測試後 `MASTER_TMP` 為 0 筆，私人照片 bucket 設定正確，正式新增頁全欄位 render 且 browser console 無錯誤。
- Employee Account production E2E 通過：建立帳號、重設密碼、停用、恢復及 UI 狀態皆成功，browser console 無錯誤；測試 Auth User、Employee、Account、Department、Position 與相關 audit 已清除，五項殘留計數皆為 0。
- Database transaction 驗證 Auth link、membership、password-reset audit 與 database-level self-suspension rejection，測試 transaction 已 rollback。
- Supabase production 跨租戶 integration test 六項斷言全數通過：同租戶可讀、跨租戶 Tenant/Employee 不可讀、authenticated client 不可寫、anon 不可讀、跨租戶 RPC 與 composite foreign key 均被阻擋。
- 跨租戶測試使用 transaction-scoped fixture 並執行 `ROLLBACK`；獨立清理查詢確認 Tenant、Company、Employee 殘留皆為 0。
- ESLint、TypeScript 與 53 個 Vitest tests 通過；本次只有測試與文件變更，不含 Database Migration、公開 API 或 Breaking Change。
- Server session 與 server-only Auth Admin clients 已改用 `Database` generic；Employee Master／Account domain types 改由 generated types 衍生。
- ESLint、TypeScript、56 個 Vitest tests 與 Next.js production build 通過；typed data boundary 變更不包含 Database Migration、公開 API 或 Breaking Change。
- `202608250010` 先在 production 完整 transaction/rollback 驗證，再正式套用並記錄 migration history。
- 排班 production integration test 8 項全數通過；確認正式班別為 540／660 分鐘，測試 Shift、Tenant、Employee fixture 殘留皆為 0。
- ESLint、TypeScript、61 個 Vitest tests 與 Next.js production build 通過。
- `202608250011` production transaction/rollback、正式套用、RPC/index/migration history 與 fixture cleanup 驗證通過。
- 排班 production integration test 擴充為 published version clone 與 batch assignment save；所有 assertion 通過並 rollback。
- ESLint、TypeScript、68 個 Vitest tests 與包含 `/admin/schedules` 的 Next.js production build 通過。
- Production `/admin/schedules` 以管理員 session 成功載入；班別、在職員工及週期資料正常，console 無 warning/error。390px viewport 導覽可見、摘要為雙欄且頁面沒有水平溢出。
- `202608250012` 已套用 Supabase production；catalog 驗證新 policy、舊 policy 移除與 migration history 三項皆為 `true`。
- Employee Schedule RLS rollback-only production test 三項全數通過：本人 published 可讀、他人 published 與本人 draft 不可讀；測試 Auth／Membership／Employee／Schedule fixtures 全部 rollback。
- ESLint、TypeScript、73 個 Vitest tests 與包含 `/my-schedule` 的 Next.js production build 通過。
- Vercel production deployment `55bf792` 為 Ready；`hrms.8sots.com.tw/` 與 `/my-schedule` 使用既有管理員 session 載入成功，真實 tenant、disabled 未上線功能及未連結 Employee 空狀態正確。

## 2026-08-24

### Added

- 建立 Build 0 的 `PROJECT_CONTEXT.md`、`ARCHITECTURE.md`、`ADR.md`、`CHANGELOG.md` 與 `NEXT_STEPS.md`。
- 記錄初始產品邊界、核心業務約束、模組界線及八項架構決策。
- 建立 Next.js 16、React 19、TypeScript strict、ESLint 與 Vitest 專案骨架。
- 建立 responsive 員工今日工作台、行動版導覽與 PWA manifest。
- 建立 Supabase SSR server client、環境變數範本及 13 項通過的 unit/contract tests。
- 初始化本機 Git repository，預設分支為 `main`。
- 將 Build 1 專案同步至 `shxck888/8sots` repository 的 `hrms/` 目錄。
- 新增 Data API grants migration 與相關安全 contract tests。
- 記錄 Supabase production project primary region 為 Tokyo。

### Changed

- 技術選型由待決更新為 Next.js App Router、Supabase Auth/JS/SSR、Zod 與 SQL migrations（無 ORM）。

### Database

- 新增 `202608240001_foundation.sql`，定義 Tenant、Membership、Company、Location、Role、Permission、Scope 與 Audit Log 基礎結構。
- Migration 啟用 tenant RLS read policies、composite tenant foreign keys，並刻意不授予 authenticated client 寫入 policy。
- Migration 尚未套用至 Supabase project，因此遠端資料庫目前沒有可驗證變更。
- 新增 `202608240002_data_api_grants.sql`：撤銷 anon/authenticated 預設表權限，只授予 authenticated tenant/RBAC 必要表 SELECT；Audit Log 不開放 client access。

### API

- 新增 `GET /api/health`。
- 新增 `GET /api/v1/me`；未登入回傳 `401`，Supabase 未設定回傳 `503`。

### Breaking Changes

- 無。

### Validation

- TypeScript、ESLint、16 個 Vitest tests 與 Next.js production build 通過。
- Local smoke test：首頁 `200`、health `200`、未設定 Supabase 的 me endpoint `503`（符合預期）。
