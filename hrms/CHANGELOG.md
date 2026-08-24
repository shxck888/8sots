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

### Changed

- 未登入存取 `/` 現在會 `307` 導向 `/login`；已登入存取 `/login` 會導向 `/`。
- 專案文件同步為已完成 Supabase migrations、Vercel environment/custom domain 的實際狀態。
- 登入欄位由 Email 改為 3–32 位英數／底線帳號；密碼規則改為 6–64 位英數混合。
- 修正 Vercel Supabase environment variables 的空值與被截短 publishable key，重新部署 production。

### Database

- 新增 idempotent reference-data migration `202608250003_platform_admin_permission.sql`；無 table/schema breaking change。
- Production 已建立 `8sots` tenant、管理員 membership/RBAC 關聯及 audit record；不將環境特定 Auth user UUID 寫入 migration。
- 新增並套用 `202608250004_employee_management.sql`：Employee table、`employee_status`、`employee.manage` permission、permission evaluator、audited create/update RPC 與 tenant RLS。
- Employee table 僅授予 authenticated SELECT；新增／修改只能執行明確 grant 的 permission-checked RPC，無 delete 或直接 client write。
- 新增並套用 forward-fix `202608250005_employee_auth_link_unique_fix.sql`，允許多位尚未連結 Auth User 的員工，同時維持非空 `auth_user_id` 的 tenant 內唯一性。

### API

- 新增 `GET /auth/callback`；既有 JSON API contract 無 breaking change。
- 新增員工管理 Server Actions 與 database RPC；既有 JSON API 無變更。

### Breaking Changes

- 首頁不再允許匿名瀏覽；這是預期的 authentication boundary 變更。
- 登入識別由 Email 改為自訂帳號；原 Email 不能直接填入新登入欄位。

### Validation

- 本機 production HTTP smoke test：`/` 回傳 `307` 至 `/login`、`/login` 回傳 `200`、`/api/health` 回傳 `200`。
- Production `admin` 登入、tenant 顯示、登出與 RBAC bootstrap 查詢通過；跨租戶負向 RLS 測試仍未完成。
- ESLint、TypeScript、35 個 Vitest tests 與 Next.js production build 通過。
- Production 管理後台列表／表單 render、console、migration history 與 transaction-scoped create/update/rollback 驗證通過；沒有留下測試員工資料。

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
