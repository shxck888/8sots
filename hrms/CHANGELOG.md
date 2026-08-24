# Changelog

本檔只記錄實際完成的變更，不將規劃中的產品功能列為 Added。

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
