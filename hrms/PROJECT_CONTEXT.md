# 餐飲 eHR — Project Context

Last Updated: 2026-08-25

## Project Overview

餐飲 eHR 是面向台灣餐飲業的多租戶人資 SaaS，以 responsive Web / PWA 服務員工、主管、HR 與業主。目標涵蓋組織與員工主檔、排班、GPS／Wi-Fi／QR 打卡、考勤、假勤與簽核、薪資、勞健保、通知、報表及稽核。系統不依賴 LINE；法規、費率與薪資規則必須可設定並保留版本。

**Build 1 的登入、Employee Master、排班、GPS 原始打卡、Attendance 計算與補打卡流程已完成 production 驗證**。Next.js 應用、Supabase production schema、Vercel deployment 與 `hrms.8sots.com.tw` 已建立。打卡採伺服器正式時間；Attendance 以版本化快照重算，原始 Punch 永不覆寫。

## Current Status

### DONE（已完成且有驗證證據）

- Next.js 16 / React 19 / TypeScript strict 應用骨架、ESLint、Vitest、production build 與 PWA manifest。
- Responsive 員工今日工作台已讀取真實 published schedule，並提供明確同意後的 GPS 上／下班打卡；休假與通知仍標示未上線。
- `GET /api/health` 與 `GET /api/v1/me` 基線。
- Tenant、Membership、Company、Location、RBAC、Audit Log、RLS 與最小 Data API grants migrations。
- Supabase production 已套用並在 migration history 確認 `202608240001` 至 `202608250014`；`014` 新增版本化 Attendance 計算、班段異常、獨立更正申請與 append-only 決策。
- GitHub `shxck888/8sots/hrms`、Vercel `8sots-hrms`、Supabase public credentials 與 `hrms.8sots.com.tw`。
- 自訂帳號規則為 3–32 位英文字母、數字或底線；密碼為 6–64 位英數混合。
- Production 管理員登入、tenant membership 顯示與登出 smoke test 已通過；Supabase bootstrap query 同時驗證 active membership、role 與 permission。
- 簡版管理後台員工列表、搜尋、新增與編輯已上線；資料 tenant-scoped、無直接 client write，mutation 經 `employee.manage` permission-checked RPC 並寫入 audit log。
- 完整 Employee Master 已上線：身分證加密／遮罩、生日、性別、地址、私人照片、緊急聯絡、部門、職位、主管、五種任職類型、離職日、試用期與 effective-dated employment record。Production transaction create/update/rollback、私人 bucket、正式表單與 console smoke test 通過，未留下測試資料。
- 員工登入帳號管理已上線：管理員可建立自訂帳號、重設密碼、停用及恢復；Auth User 與 Employee 分離，以 `auth_user_id` 連結並同步 active membership。密碼不落資料庫或 audit；service-role 只存在 server-side。Production E2E 已完成並清除所有測試資料。
- 跨租戶安全 integration test 已在 Supabase production 通過：同租戶可讀、跨租戶不可讀、authenticated client 不可寫、anon 不可讀、跨租戶 RPC 與 foreign key 皆被阻擋；transaction rollback 後 Tenant／Company／Employee fixture 殘留均為 0。
- 排班 foundation 已上線：班別由有序 minute-offset segments 組成，可表達兩段班與跨日班；班表採 draft/published/superseded versions，一位員工同日一個班別，發布後 Assignment 與已使用 Shift Segment 不可覆寫。
- 海之星正式班別已建立：平日班 `10:00–14:00`、`16:00–21:00`（540 分鐘）；假日班 `10:00–21:00`（660 分鐘）。日期要使用哪一種班別由排班者指定，系統目前不自行把週末判定為假日。
- Production rollback-only 排班測試 8 項全數通過：兩種正式工時、跨日、重疊拒絕、跨租戶拒絕、發布、發布後班表與班別不可變；Shift／Tenant／Employee fixtures 殘留皆為 0。
- 管理後台 `/admin/schedules` 週排班第一版：週切換、版本／狀態摘要、在職員工 × 七日表格、已發布版本唯讀檢視、平日／假日班選擇、未排班、建立／複製草稿、整週原子儲存、發布確認及 responsive navigation。
- 員工端 `/my-schedule` 週班表第一版：週切換、兩段／連續／跨日班段、週工時與未排班狀態；僅顯示自己的 published assignments，未排班不被誤標為休假。
- `lib/database.types.ts` 已同步 production 已驗證的 `014` schema，server session 與 Auth Admin clients 均使用 application `Database` generic；migration-to-types drift contract 已建立。
- Employee Schedule RLS rollback-only production test 三項通過：本人 published 可讀、他人 published 與本人 draft 不可讀；全部 fixtures 已 rollback。
- Vercel production code commit `2b0804f` 已 Ready；正式網域 `/attendance`、`/admin/attendance` 與 `/admin/schedules` 已完成登入 session smoke test。管理員排班／出勤區塊與新版手機可讀性 CSS 正常載入且無 browser error；未連結 Employee 的 `admin` 在員工頁顯示安全保護狀態。
- GPS 原始打卡 foundation 已完成：`/` 要求每次定位同意後才可打卡，`/attendance` 顯示個人紀錄，`/admin/attendance` 以 `attendance.manage` 顯示 tenant 原始證據。正式時間採 server timestamp；同工作日依序交替上／下班以支援兩段班；原始資料不可更新或刪除。
- Production rollback-only Punch 測試四項通過：上下班交替、idempotency 防重、禁止 authenticated 直接新增、禁止修改原始紀錄；Auth／Employee／Punch fixtures 均為 0。
- Attendance rollback-only production test 四項通過：缺下班卡辨識、更正核准後納入重算、舊計算批次保留、authenticated client 不可直接寫入；fixtures 均為 0。
- Attendance／Correction UI 已正式上線：員工可提出補卡申請並查看自己的計算快照／申請狀態；具 `attendance.manage` 權限的管理員可依日期範圍產生新快照、查看異常並核准或拒絕更正。
- 手機版已套用高可讀性字級與觸控規範：主要小字至少約 15px、表單控制 16px、重要出勤時間 18px，並以 regression test 防止縮回過小字級。
- 動態頁面已加入 employee/admin `loading.tsx` 即時回饋與部分預取；登入、membership、三項管理權限及已連結 Employee 查詢使用 React request-scoped cache 去重，權限 RPC 改為平行執行。
- 目前程式通過 ESLint、TypeScript、90 項 Vitest 與 Next.js production build。

### IN PROGRESS

- 使用真實且經授權連結的 Employee 帳號完成手機 GPS 打卡 → 缺卡 → 補卡 → 核准 → 重算 operational acceptance。

### PLANNED

- Password recovery、邀請、MFA、QR/geofence 與後續業務模組。
- Phase 2：Leave、Overtime、通用 Approval。
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
| Quality | ESLint、TypeScript strict、Vitest（90 tests）、Next production build；Database types drift contract；navigation performance contract；Supabase production rollback-only RLS／Schedule／Punch／Attendance integration tests |

## Core Modules

- **DONE:** Platform 與 database foundation。
- **DONE:** 自訂帳號登入、登出、session 與 route protection production slice。
- **DONE:** 管理後台與 tenant-scoped 簡版員工主檔新增／查詢／編輯 production slice。
- **DONE:** 完整 Employee Master、effective-dated 任職履歷、身分證保護與私人照片 production slice。
- **DONE:** 員工登入帳號 provisioning、重設密碼、停用／恢復與 Auth link production slice。
- **DONE:** Organization tenant/RLS foundation，以及 Employee RBAC/Audit application enforcement。
- **DONE:** tenant-wide Shift/Shift Segment 與 Schedule draft/publish database foundation；目前不要求門市。
- **DONE:** 管理員週排班、草稿整週儲存與發布 UI 第一版。
- **DONE:** 員工端 Published Schedule 週表與真實今日工作台。
- **DONE:** GPS 原始上／下班打卡、個人紀錄與管理員唯讀證據頁；未設定店址圍欄。
- **DONE:** Attendance Rule V1、版本化計算批次、每日／班段／異常快照、員工補卡申請與管理員核准／拒絕 Database foundation。
- **DONE:** Attendance 日期範圍計算、版本化快照、員工補卡與管理員審核 UI production slice。
- **PLANNED:** Password Recovery/MFA、QR/geofence、Leave、Overtime、Approval、Payroll、Insurance、Notification、Report。

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
- `app/page.tsx`、`app/my-schedule/`、`app/workspace-shell.tsx`：需要 session 的真實今日排班、員工週班表與共用導覽
- `lib/my-schedule.ts`、`lib/schedule-display.ts`：已發布個人班表資料服務與台北日期／工時顯示 helpers
- `app/api/health/route.ts`、`app/api/v1/me/route.ts`：目前 API
- `lib/supabase/server.ts`、`lib/supabase/admin.ts`：一般 server session client 與 server-only Auth Admin client
- `lib/database.types.ts`、`lib/database.ts`：production-generated Schema types 與 PostgreSQL function nullable-argument application overlay
- `app/admin/employees/`、`lib/admin.ts`、`lib/employees.ts`、`lib/pii.ts`：員工管理 UI、Server Actions、授權、validation 與身分證保護
- `app/admin/employees/[id]/account-actions.ts`、`account-panel.tsx`、`lib/employee-accounts.ts`：員工帳號建立、重設與狀態管理
- `app/admin/schedules/`、`lib/schedules.ts`：管理後台週排班、Server Actions、日期與表單 validation
- `app/punch/`、`app/attendance/`、`app/admin/attendance/`、`lib/punch-contract.ts`、`lib/punches.ts`：GPS 打卡 action、員工紀錄與管理員原始證據
- `lib/attendance-contract.ts`、`202608250014_attendance_calculation_and_corrections.sql`：出勤計算與補卡申請／審核邊界
- `supabase/migrations/`：已套用 production 的版本化 schema、grant 與 reference-data migrations
- `supabase/migrations/202608250010_schedule_foundation.sql`、`supabase/seeds/8sots_schedule_templates.sql`：排班 schema 與海之星正式班別
- `supabase/tests/cross_tenant_rls.sql`、`schedule_foundation.sql`、`employee_schedule_visibility.sql`、`punch_foundation.sql`：production-compatible rollback-only 測試
- `tests/`：unit 與 migration contract tests

登入、員工主檔、帳號生命週期、跨租戶隔離、排班、GPS 原始打卡、Attendance 計算與補打卡流程已完成。下一步是真實已連結 Employee 的手機 E2E 驗收，以及確認寬限／異常規則；QR 與 geofence 仍等待門市資料。
