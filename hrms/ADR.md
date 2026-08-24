# Architecture Decision Records

Last Updated: 2026-08-24

ADR 的 Accepted 表示方向已決定，不表示已有程式碼或測試。日後變更需新增 ADR 並將舊紀錄標為 Superseded，不覆蓋歷史。

## ADR-001: Multi-tenant data isolation from the first schema

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 產品需支援多集團、公司與分店，跨租戶資料外洩屬最高風險。
- **Decision:** Tenant 是隔離邊界；租戶業務資料帶 `tenant_id`，查詢由 server-side tenant context 強制限縮。RLS 細節於 schema 實作前另行決定。
- **Reason:** 後補 tenant isolation 的重構與安全風險過高。
- **Alternatives:** 單租戶資料庫後續改造；每租戶獨立資料庫。
- **Consequences:** Unique constraints、indexes、foreign keys、測試與 audit 都必須含租戶語意。

## ADR-002: Modular monolith first

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 領域廣但目前為 Build 0，過早拆服務會增加部署及一致性成本。
- **Decision:** 初期使用單一部署單元與清晰 domain module boundaries，不建立 microservices。
- **Reason:** 兼顧迭代速度、交易一致性與未來可拆分性。
- **Alternatives:** Microservices；無邊界的單體應用。
- **Consequences:** 跨模組不得任意耦合；需要介面、事件及依賴規則。

## ADR-003: Immutable punch records with corrective records

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 原始打卡是考勤與薪資證據，直接覆寫會失去可追溯性。
- **Decision:** 原始 punch append-only；補卡與更正以獨立 request/action/record 表達並保留原值。
- **Reason:** 支援稽核、爭議處理與歷史重現。
- **Alternatives:** 直接更新 punch；只保存最後值。
- **Consequences:** 查詢需區分 raw evidence 與核准後有效結果；更正流程需簽核及 audit。

## ADR-004: Effective-date versioning for regulatory and employment rules

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 台灣法規、保險、稅務、薪資與員工條件會隨時間變動。
- **Decision:** 規則與關鍵任職／薪資設定以 effective date/version 保存，不 hard-code 永久數值。
- **Reason:** 確保歷史期間可重算、可解釋。
- **Alternatives:** 覆寫現值；將費率寫死在程式中。
- **Consequences:** 需處理版本重疊、適用日查找與規則來源治理。

## ADR-005: Payroll snapshot and lock semantics

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 排班、考勤與規則日後會變動，已結算薪資不能跟著漂移。
- **Decision:** Payroll calculation 保存輸入／規則版本及輸出快照；LOCKED 後禁止直接修改，以受控調整或新期間處理。
- **Reason:** 保障財務一致性與可稽核性。
- **Alternatives:** 每次即時計算；鎖定後仍更新原紀錄。
- **Consequences:** 增加儲存與批次狀態管理；計算及鎖定須使用 transaction/idempotency。

## ADR-006: RBAC combined with organizational scope

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 同一入口服務員工、主管與多層管理者，單一角色不足以表達可操作範圍。
- **Decision:** 使用 permission-based RBAC，授權結果同時受 tenant/company/location/department scope 限制。
- **Reason:** 避免角色爆炸並支援多分店委派。
- **Alternatives:** admin/employee 二分；只依角色不管資料範圍。
- **Consequences:** API、UI 與資料查詢需共享一致授權語意，並建立負向權限測試。

## ADR-007: Shift segments and explicit work-date ownership

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 餐飲業常見兩段班與跨日班，單一開始／結束時間無法可靠表達。
- **Decision:** Shift 由一個或多個 segment 組成；Schedule/Attendance 明確保存 work date 與 timezone 歸屬。
- **Reason:** 正確處理休息、跨午夜與工時計算。
- **Alternatives:** 單一時段加休息分鐘；以 calendar date 猜測歸屬。
- **Consequences:** 排班驗證與考勤配對較複雜，但可避免日期邊界錯算。

## ADR-008: GitHub-to-Vercel delivery with Supabase PostgreSQL

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 使用者指定程式碼由 GitHub 管理、Vercel 執行，資料庫放置於 Supabase。
- **Decision:** 以 GitHub 作部署來源、Vercel 作 Web/API 執行平台、Supabase PostgreSQL 作系統資料庫。
- **Reason:** 符合既定操作方式並提供 managed hosting/database 起點。
- **Alternatives:** 自管 Docker 主機；其他雲端與資料庫服務。
- **Consequences:** 框架、連線池、serverless runtime、migration、region、RLS 與備份策略必須針對 Vercel/Supabase 驗證；本 ADR 不等同選定 Supabase Auth。

## ADR-009: Next.js App Router as the modular monolith runtime

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 需要同時支援 responsive PWA、server-rendered UI、REST API 與 Vercel 部署，並維持單一可管理的 TypeScript codebase。
- **Decision:** 採 Next.js 16 App Router、React 19、TypeScript strict 與 Route Handlers 作為第一階段 modular monolith runtime。
- **Reason:** 與 Vercel 原生整合，並可在同一 codebase 保持 UI、API 與 server boundary。
- **Alternatives:** NestJS + 獨立 SPA；其他 Vercel-compatible framework。
- **Consequences:** 必須避免將 domain rule 寫入 page/route；長時間工作不可綁在同步 serverless request。

## ADR-010: Supabase Auth and RLS defense in depth

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 系統需要 managed identity、cookie-based server session 與 PostgreSQL tenant isolation，且既定資料平台為 Supabase。
- **Decision:** 使用 Supabase Auth；Next.js server 仍執行 permission checks，PostgreSQL RLS 作第二道租戶隔離。Authenticated client 初期不取得業務表寫入 policy。
- **Reason:** 集中 identity 與 database access，同時避免只依賴 UI 或單一 server check。
- **Alternatives:** 自建認證；只使用 server service role 且停用 RLS。
- **Consequences:** User 與 Employee 必須分離；service-role key 不得進入 client；RLS 必須有跨租戶 integration tests。

## ADR-011: Supabase client data access without an ORM

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** Vercel serverless 對 raw PostgreSQL connection pooling 有額外負擔，而 Supabase 提供 HTTP data API 與型別產生流程。
- **Decision:** 第一階段透過 `@supabase/supabase-js` / `@supabase/ssr` 存取資料，Schema 以 SQL migration 管理，不引入 Prisma 或其他 ORM。
- **Reason:** 減少連線管理與雙重 schema abstraction，直接使用 PostgreSQL/RLS 能力。
- **Alternatives:** Prisma + pooler；Drizzle + PostgreSQL driver。
- **Consequences:** 必須從已套用 Schema 產生 TypeScript database types；複雜交易需使用 database function/RPC 或受控 server transaction 策略。

## ADR-012: Tokyo as the Supabase primary region

- **Status:** Accepted
- **Date:** 2026-08-24
- **Context:** 主要使用者在台灣，Supabase project 建立時必須選定 primary database region。
- **Decision:** Supabase PostgreSQL primary region 使用 Northeast Asia (Tokyo), `ap-northeast-1`。
- **Reason:** 鄰近台灣且提供明確資料位置，project 已依此建立。
- **Alternatives:** Southeast Asia (Singapore)；一般 Asia-Pacific region。
- **Consequences:** Vercel server functions 應盡量選擇鄰近 Tokyo 的執行 region，並以實測延遲確認；跨區備援與資料落地需求仍需另行評估。
