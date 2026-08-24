# 餐飲 eHR — Project Context

Last Updated: 2026-08-25

## Project Overview

餐飲 eHR 是面向台灣餐飲業的多租戶人資 SaaS，以 responsive Web / PWA 服務員工、主管、HR 與業主。目標涵蓋組織與員工主檔、排班、GPS／Wi-Fi／QR 打卡、考勤、假勤與簽核、薪資、勞健保、通知、報表及稽核。系統不依賴 LINE；法規、費率與薪資規則必須可設定並保留版本。

目前是 **Build 1（Auth and tenant foundation）**。Next.js 應用、Supabase production schema、Vercel deployment、`hrms.8sots.com.tw` 與 public environment variables 已建立。自訂帳號/password 登入頁、登出、PKCE callback、cookie session refresh、未登入 route protection，以及登入者／active tenant 顯示已完成本機驗證；尚待建立正式管理員帳號並完成 production Auth/RLS end-to-end 驗證。

## Current Status

### DONE（已完成且有驗證證據）

- Next.js 16 / React 19 / TypeScript strict 應用骨架、ESLint、Vitest、production build 與 PWA manifest。
- Responsive 員工「今日工作台」靜態 UI；不代表打卡、班表或出勤功能已串接。
- `GET /api/health` 與 `GET /api/v1/me` 基線。
- Tenant、Membership、Company、Location、RBAC、Audit Log、RLS 與最小 Data API grants migrations。
- Supabase production 已套用 `202608240001 foundation` 與 `202608240002 data_api_grants`。
- GitHub `shxck888/8sots/hrms`、Vercel `8sots-hrms`、Supabase public credentials 與 `hrms.8sots.com.tw`。
- 自訂帳號規則為 3–32 位英文字母、數字或底線；密碼為 6–64 位英數混合。登入程式切片通過 lint、TypeScript、22 項 Vitest、production build 與本機 HTTP smoke test；此項不等同 production Auth 已驗收。

### IN PROGRESS

- Auth / Organization foundation：程式、production schema、credentials 與 deployment 已建立；尚未做真實帳號登入、tenant fixture 與跨租戶 RLS integration test。
- 首頁仍以代表性假資料呈現班表、出勤與打卡，按鈕尚未連接 domain operation。

### PLANNED

- Password recovery、邀請、員工主檔、排班、打卡、出勤與後續業務模組。
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
| Quality | ESLint、TypeScript strict、Vitest（22 tests）、Next production build |

## Core Modules

- **DONE:** Platform 與 database foundation。
- **IN PROGRESS:** Auth production verification、Organization、RBAC/Audit application enforcement。
- **PLANNED:** Employee、Schedule、Attendance、Leave、Overtime、Approval、Payroll、Insurance、Notification、Report。

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
- `supabase/migrations/`：已套用 production 的 foundation migrations
- `tests/`：unit 與 migration contract tests

Auth 仍維持 IN PROGRESS，因為目前沒有受控測試帳號與跨租戶 fixture 的正式環境驗證證據。
