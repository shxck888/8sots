# 餐飲 eHR — Project Context

Last Updated: 2026-08-24

## Project Overview

餐飲 eHR 是面向台灣餐飲業的多租戶人資 SaaS，預計以 Responsive Web / PWA 讓員工、主管、HR 與業主在同一入口依角色及權限使用。目標涵蓋組織與員工主檔、排班、GPS／Wi-Fi／QR 打卡、考勤、假勤與簽核、薪資、勞健保、通知、報表及稽核。系統不依賴 LINE，且法規、費率與薪資規則必須可設定並保留版本。

目前是 **Build 1（Foundation vertical slice）**。已建立 Next.js App Router 應用、餐飲員工工作台的 responsive 靜態切片、PWA manifest、健康檢查 API、Supabase server client、登入者組織查詢 API，以及第一批尚未套用至遠端資料庫的 Supabase SQL migration。交付方向為 GitHub → Vercel，資料庫與認證採 Supabase。

## Current Status

### DONE（已完成且本機驗證通過）

- 建立五份長期專案文件的 Build 0 基線。
- 確認產品範圍、部署方向（GitHub → Vercel）與資料庫平台（Supabase）。
- Next.js 16 / React 19 / TypeScript strict 應用骨架、ESLint、Vitest 與 production build。
- Responsive 員工「今日工作台」靜態 UI 與 PWA manifest；此項只代表介面切片完成，不代表打卡、班表或出勤功能已串接。
- `GET /api/health`（HTTP smoke test 200）。
- 基礎 migration contract tests：RLS 啟用、tenant composite FK 與 client 無寫入 policy。
- 初始化本機 Git repository，預設分支為 `main`；尚未建立 commit 或 GitHub remote。

### IN PROGRESS

- Auth / Organization foundation：Supabase client、`GET /api/v1/me` 與 SQL migration 已建立，但尚無 Supabase project credentials、尚未實際套用 migration，也未做真實登入／RLS integration test。
- 首頁目前使用代表性假資料，按鈕尚未連接 domain operation。

### PLANNED

- 實際遠端資料庫、登入頁、員工資料、打卡、排班、出勤、業務 API 與 Vercel/GitHub 部署設定。
- Phase 1：技術骨架、Auth、Organization、Employee、Location、Shift、Schedule、GPS Punch、Attendance。
- Phase 2：Leave、Overtime、Punch Correction、Approval。
- Phase 3：Salary、Payroll、Insurance、Payslip。
- Phase 4：分析、人事成本、營收整合、進階規則、多公司與外部 API。

## Tech Stack

| Area | Current decision |
| --- | --- |
| Client | Next.js 16 App Router、React 19、TypeScript、responsive Web / PWA |
| Hosting | Vercel |
| Source control / delivery source | GitHub |
| Database | Supabase PostgreSQL |
| Backend/API | Next.js Route Handlers、REST-style JSON |
| Data access / validation / auth | Supabase JS/SSR（不使用 ORM）、Zod、Supabase Auth |
| Quality | ESLint、TypeScript strict、Vitest、Next production build |
| Queue / cache / object storage | 尚未選定；依後續工作負載導入 |

## Core Modules

- **DONE:** Platform foundation（build、lint、typecheck、unit/contract test、health endpoint）。
- **IN PROGRESS:** Auth、Organization、RBAC/Audit database foundation。
- **PLANNED:** Employee、Schedule、Attendance、Leave、Overtime、Approval、Payroll、Insurance、Notification、Report；Audit 的業務寫入機制亦尚未完成。

## Important Business Rules

- 每筆租戶資料必須有明確 tenant scope；跨租戶讀寫不可發生。
- 原始 Punch Record 採追加式不可變更；更正以獨立申請／紀錄保存。
- 跨日班以 work date 與 shift segment 明確歸屬；工時以整數分鐘計算。
- 晚下班不等於核准加班；加班認列須依規則與簽核結果。
- Payroll 鎖定後不可直接修改，必須保存計算輸入、規則版本與結果快照。
- 薪資、保險、稅務、假別與法規參數須支援 effective date/version，不得寫死。
- 金額不得用 binary floating point；精確表示方式仍待 Schema 決策。
- 關鍵流程使用明確狀態，不以單一 boolean 取代狀態機。
- 重要資料變更與敏感操作必須可稽核。

## Important Constraints

- 不串接或依賴 LINE；使用者直接使用同一套 Web / PWA。
- Mobile-first、適合台灣餐飲業的兩段班、跨日班、正職與工讀混合情境。
- 採 RBAC 並支援組織範圍，不得只區分 admin / employee。
- Multi-tenant 與歷史資料可重現性需從第一版 Schema 納入。
- 法規內容仍須由合格人士確認；系統提供版本化規則能力，不把目前數值視為永久常數。

## Important Files

- `PROJECT_CONTEXT.md`：目前狀態與接手摘要
- `ARCHITECTURE.md`：已採用架構及尚未決定事項
- `ADR.md`：不可只存在對話中的重大決策
- `CHANGELOG.md`：實際完成的變更
- `NEXT_STEPS.md`：依風險排序的待辦
- `app/page.tsx`、`app/globals.css`：第一個員工工作台切片
- `app/api/health/route.ts`：不依賴外部服務的健康檢查
- `app/api/v1/me/route.ts`：登入者與 tenant membership 查詢
- `lib/supabase/server.ts`：server-side Supabase client
- `supabase/migrations/202608240001_foundation.sql`：尚待實際套用的 tenant/RBAC/RLS foundation migration
- `tests/`：unit 與 migration contract tests

目前沒有遠端 Supabase 套用紀錄或 production deployment；SQL migration 存在不代表遠端資料表已建立。
