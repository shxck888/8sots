# 餐飲 eHR — Project Context

Last Updated: 2026-08-25

## Project Overview

餐飲 eHR 是面向台灣餐飲業的多租戶人資 SaaS，以 responsive Web / PWA 服務員工、主管、HR 與業主。目標涵蓋組織與員工主檔、排班、GPS／Wi-Fi／QR 打卡、考勤、假勤與簽核、薪資、勞健保、通知、報表及稽核。系統不依賴 LINE；法規、費率與薪資規則必須可設定並保留版本。

目前是 **Build 1（Auth, tenant and employee foundation）**。Next.js 應用、Supabase production schema、Vercel deployment 與 `hrms.8sots.com.tw` 已建立。自訂帳號登入、管理員後台與完整 Employee Master 已通過 production 驗證；員工登入帳號連結與第二 tenant 的跨租戶 RLS integration test 尚未完成。

## Current Status

### DONE（已完成且有驗證證據）

- Next.js 16 / React 19 / TypeScript strict 應用骨架、ESLint、Vitest、production build 與 PWA manifest。
- Responsive 員工「今日工作台」靜態 UI；不代表打卡、班表或出勤功能已串接。
- `GET /api/health` 與 `GET /api/v1/me` 基線。
- Tenant、Membership、Company、Location、RBAC、Audit Log、RLS 與最小 Data API grants migrations。
- Supabase production 已套用並在 migration history 確認 `202608240001` 至 `202608250007`；`006` 建立完整 Employee Master 與私人照片 bucket，`007` 修正 tenant timezone 任職生效日。
- GitHub `shxck888/8sots/hrms`、Vercel `8sots-hrms`、Supabase public credentials 與 `hrms.8sots.com.tw`。
- 自訂帳號規則為 3–32 位英文字母、數字或底線；密碼為 6–64 位英數混合。
- Production 管理員登入、tenant membership 顯示與登出 smoke test 已通過；Supabase bootstrap query 同時驗證 active membership、role 與 permission。
- 簡版管理後台員工列表、搜尋、新增與編輯已上線；資料 tenant-scoped、無直接 client write，mutation 經 `employee.manage` permission-checked RPC 並寫入 audit log。
- 完整 Employee Master 已上線：身分證加密／遮罩、生日、性別、地址、私人照片、緊急聯絡、部門、職位、主管、五種任職類型、離職日、試用期與 effective-dated employment record。Production transaction create/update/rollback、私人 bucket、正式表單與 console smoke test 通過，未留下測試資料。
- 目前程式通過 ESLint、TypeScript、42 項 Vitest 與 Next.js production build。

### IN PROGRESS

- Organization / RLS foundation：首位 tenant 與管理員已建立；尚未建立第二 tenant fixture 與跨租戶負向 integration test。
- 員工登入帳號 provisioning、停用與 `employees.auth_user_id` 連結尚未實作。
- 首頁仍以代表性假資料呈現班表、出勤與打卡，按鈕尚未連接 domain operation。

### PLANNED

- Password recovery、邀請、員工帳號連結、排班、打卡、出勤與後續業務模組。
- Phase 2：Leave、Overtime、Punch Correction、Approval。
- Phase 3：Salary、Payroll、Insurance、Payslip。
- Phase 4：分析、人事成本、營收整合、進階規則、多公司與外部 API。

## Tech Stack

| Area | Current decision |
| --- | --- |
| Client | Next.js 16 App Router、React 19、TypeScript、responsive Web / PWA |
| Hosting / delivery | GitHub → Vercel；custom domain `hrms.8sots.com.tw` |
| Database | Supabase PostgreSQL，Tokyo (`ap-northeast-1`) |
| Backend/API | Next.js Route Handlers、Server Actions、REST-style JSON |
| Data / validation / auth | Supabase JS/SSR（無 ORM）、Zod、Supabase Auth |
| Quality | ESLint、TypeScript strict、Vitest（42 tests）、Next production build |

## Core Modules

- **DONE:** Platform 與 database foundation。
- **DONE:** 自訂帳號登入、登出、session 與 route protection production slice。
- **DONE:** 管理後台與 tenant-scoped 簡版員工主檔新增／查詢／編輯 production slice。
- **DONE:** 完整 Employee Master、effective-dated 任職履歷、身分證保護與私人照片 production slice。
- **IN PROGRESS:** Organization、跨租戶 RLS、RBAC/Audit application enforcement。
- **PLANNED:** Employee Account/Employment History、Schedule、Attendance、Leave、Overtime、Approval、Payroll、Insurance、Notification、Report。

## Non-Negotiable Rules

- 每筆租戶資料必須有 tenant scope，跨租戶讀寫不可發生。
- 原始 Punch Record append-only；更正使用獨立紀錄與簽核。
- 跨日班需保存 work date、timezone 與 shift segment；工時使用整數分鐘。
- Payroll 鎖定後不可直接修改；保存輸入、規則版本與結果快照。
- 薪資、保險、稅務、假別與法規參數使用 effective date/version。
- 金額不得使用 binary floating point；重要狀態與敏感操作必須可稽核。

## Important Files

- `app/login/`、`app/auth/callback/route.ts`、`proxy.ts`：登入、登出、callback 與 session refresh
- `lib/auth.ts`：自訂帳號／密碼規則、Supabase 內部識別映射、安全 redirect 與顯示名稱規則
- `app/page.tsx`：需要 session 的員工工作台
- `app/api/health/route.ts`、`app/api/v1/me/route.ts`：目前 API
- `lib/supabase/server.ts`：server-side Supabase client
- `app/admin/employees/`、`lib/admin.ts`、`lib/employees.ts`、`lib/pii.ts`：員工管理 UI、Server Actions、授權、validation 與身分證保護
- `supabase/migrations/`：已套用 production 的版本化 schema、grant 與 reference-data migrations
- `tests/`：unit 與 migration contract tests

登入與員工主檔管理已完成 production 驗證；整體 Auth/Organization/Employee foundation 仍維持 IN PROGRESS，直到員工帳號連結、跨租戶 RLS fixture 與完整 permission enforcement 完成。
