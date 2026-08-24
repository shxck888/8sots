# Architecture

Last Updated: 2026-08-24

本文件描述目前程式碼與已採用方向。SQL migration 尚未套用至 Supabase，因此列出的資料表是 version-controlled schema intent，不代表遠端資料表已存在。

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

原始碼以 GitHub 為部署來源。初期採 modular monolith：同一 Next.js 部署單元內保持清楚模組邊界；目前不建立 microservices。資料存取使用 Supabase client，不引入 ORM。背景工作、快取與物件儲存尚未選型，也尚未實作。

## Module Boundaries

- **Auth**：身分驗證、session/token 生命週期；不決定業務資料 scope。
- **Organization**：Tenant、Company、Location、Department、Position 與組織範圍。
- **Employee**：人員主檔、任職及有效日期異動；不計算薪資。
- **Schedule**：Shift、Shift Segment、排班及發布版本；不產生原始打卡。
- **Attendance**：Punch、工作日歸屬、考勤計算與異常；不自動核准加班。
- **Leave / Overtime**：申請、額度／認列及業務狀態。
- **Approval**：可配置簽核流程、步驟與動作，服務其他模組。
- **Payroll / Insurance**：有效日期規則、批次計算、鎖定與快照；不得反向修改考勤來源。
- **Notification / Report / Audit**：跨模組消費者；不得成為核心交易資料的唯一來源。

依賴原則：入口層 → 應用服務 → domain rules → data access。跨模組協作須透過穩定介面或事件，不直接修改其他模組的內部資料。

## Data Flow

1. 請求在入口完成 authentication、validation、permission 與 tenant scope 檢查。
2. 應用服務執行狀態轉移與 domain rules。
3. Repository/data-access 層在交易內寫入 PostgreSQL；關鍵操作同時建立 audit evidence。
4. 通知、報表或長時間批次工作未來由事件／job 觸發；具體 queue 尚未選定。

## Key Entity Groups (Logical, Not Implemented)

- Organization：Tenant → Company → Location / Department → Position
- Identity & people：User、Employee、Employment Record、Role、Permission、Scope
- Scheduling：Shift、Shift Segment、Schedule、Schedule Change
- Attendance：Punch Record、Punch Correction、Attendance Day/Detail/Exception
- Absence：Leave Type/Grant/Balance/Request/Usage、Overtime、Comp Time
- Workflow：Approval Flow/Step/Request/Action
- Payroll：Salary Profile/Component、Payroll Period/Employee/Item/Adjustment/Snapshot、Payslip
- Compliance：Insurance/Tax Rule Version、Enrollment、Holiday/Calendar
- Platform：Announcement、Notification、Attachment、Audit Log、System Setting

第一個 migration 已定義 Tenant、Tenant Membership、Company、Location、Role、Permission、Role Permission、Membership Role 與 Audit Log；尚未套用。其他實體仍是 logical plan。

## Multi-Tenant Strategy

Tenant 是最高資料隔離邊界。業務資料攜帶 `tenant_id`，下層 foreign key 同時包含 tenant key 以阻擋跨租戶關聯。第一個 migration 已啟用 RLS，authenticated client 目前只有同 tenant read policies，沒有 client write policies。未來 mutation 只能透過 permission-checked server operation；service-role 限制仍待 production threat model 驗證。

## Authentication and Authorization

認證採 Supabase Auth，Next.js server client 以 cookie session 取得已驗證使用者。授權採 RBAC + scope；第一個 migration 已建立 role/permission/scope 結構，但 mutation enforcement 尚未實作或 integration test，因此不能聲稱完整權限控制已生效。

## Data Conventions

- 後端時間基準為 UTC，DB 使用具時區語意的 timestamp；UI 預設 `Asia/Taipei`。
- 排班與考勤另保存 local work date/timezone，支援跨午夜。
- 工時／休息時間使用整數分鐘。
- 金額採精確型別（PostgreSQL `numeric` 或整數最小單位），選擇待 Schema ADR。
- 重要歷史狀態使用 immutable record、effective dating 或 snapshot，使重算可追溯。
- 一般主檔傾向 soft delete；依法或業務要求不可刪除的交易紀錄採保留／封存。

## Infrastructure

- **Implemented locally**：Next.js 16、React 19、TypeScript、Supabase JS/SSR、Zod、ESLint、Vitest、PWA manifest、environment template。
- **Accepted hosting/data**：GitHub、Vercel、Supabase Auth/PostgreSQL。
- **Not yet selected**：object storage、queue、cache、observability、preview/production environment topology。
- GitHub source 位於 `shxck888/8sots` 的 `hrms/`；尚無遠端 Supabase project connection、Vercel deployment、CI workflow 或備份／還原驗證。

## Current API Surface

- `GET /api/health`：無外部依賴的服務 liveness，回傳 `status/service/timestamp`。
- `GET /api/v1/me`：以 Supabase Auth 取得使用者並回傳 active tenant memberships；未登入為 `401`，環境未設定為 `503`。
- API error 採 `{ error: { code, message } }` 基線。業務 API 尚未建立。

## Security Baseline

必須納入 tenant isolation、least privilege、secure cookies/CSRF、rate limiting、輸入驗證、PII/銀行資料保護、secret management、audit log 及 HTTPS。目前只有 migration 中的 tenant composite keys、RLS read isolation、無 client write policy，以及 public environment validation 已落地；其餘控制仍待實作與 integration test。
