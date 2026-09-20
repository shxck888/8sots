import { Banknote, Calculator, LockKeyhole, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMoney, payBasisLabels, payrollStatusLabels } from "@/lib/payroll-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { addAdjustment, calculateDraft, changePeriodStatus, createPeriod, removeAdjustment, reviewPeriod, saveCompensation } from "./actions";
import { ConfirmSubmit } from "./confirm-submit";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  validation: "輸入格式不正確，金額最多兩位小數。",
  review: "請填寫至少 10 個字的核對說明。",
  "1": "操作失敗；請確認薪資設定、員工薪資版本與目前狀態。",
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function PayrollPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string; period?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || !workspace.canManagePayroll) redirect("/");
  const supabase = await createSupabaseServerClient();
  const [employeeResult, periodResult, compensationResult, rulesResult] = await Promise.all([
    supabase.from("employees").select("id,employee_no,full_name").eq("tenant_id", workspace.tenantId).order("employee_no"),
    supabase.from("payroll_periods").select("*").eq("tenant_id", workspace.tenantId).order("period_month", { ascending: false }).limit(24),
    supabase.from("employee_compensation_versions").select("*").eq("tenant_id", workspace.tenantId).order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("payroll_rule_versions").select("id,effective_from,version,rules").eq("tenant_id", workspace.tenantId).order("effective_from", { ascending: false }).limit(1),
  ]);
  const loadError = employeeResult.error || periodResult.error || compensationResult.error || rulesResult.error;
  const employees = employeeResult.data ?? [];
  const periods = periodResult.data ?? [];
  const compensations = compensationResult.data ?? [];
  const selected = periods.find((period) => period.id === params.period) ?? periods[0];
  const entryResult = selected
    ? await supabase.from("payroll_entries").select("*").eq("tenant_id", workspace.tenantId).eq("payroll_period_id", selected.id).order("employee_id")
    : { data: [], error: null };
  const entries = entryResult.data ?? [];
  const itemResult = entries.length
    ? await supabase.from("payroll_items").select("*").eq("tenant_id", workspace.tenantId).in("payroll_entry_id", entries.map((entry) => entry.id)).order("created_at")
    : { data: [], error: null };
  const itemsByEntry = new Map<string, NonNullable<typeof itemResult.data>>();
  for (const item of itemResult.data ?? []) itemsByEntry.set(item.payroll_entry_id, [...(itemsByEntry.get(item.payroll_entry_id) ?? []), item]);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const latestComp = new Map<string, typeof compensations[number]>();
  for (const compensation of compensations) if (!latestComp.has(compensation.employee_id)) latestComp.set(compensation.employee_id, compensation);
  const hasSettings = Boolean(rulesResult.data?.length);

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">PAYROLL DRAFT</span><h1>薪資管理</h1><p>每次試算保留來源快照與人工調整；完成逐筆核對後才能鎖定並發布給員工。</p></div><Link className="admin-button ghost" href="/admin/settings"><Settings size={15}/> 薪資週期設定</Link></header>
    {params.saved ? <div className="admin-success">薪資資料已更新。</div> : null}
    {params.error ? <div className="admin-form-error">{errors[params.error] ?? errors["1"]}</div> : null}
    {loadError || entryResult.error || itemResult.error ? <div className="admin-form-error">薪資資料讀取失敗，請確認資料庫版本已完成更新。</div> : null}
    {!hasSettings ? <div className="attendance-recalc-alert"><Settings size={20}/><div><strong>尚未建立薪資週期設定</strong><p>請先設定結算日與發薪日，系統才允許建立薪資月份。</p></div></div> : null}

    <section className="admin-panel payroll-setup"><header><div><span className="admin-eyebrow">COMPENSATION</span><h2>員工薪資版本</h2><p>變更薪資時請建立新的生效日版本，歷史版本不會被覆寫。</p></div></header><form action={saveCompensation}>
      <label>員工<select name="employeeId" required defaultValue=""><option value="" disabled>選擇員工</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no} · {employee.full_name}</option>)}</select></label>
      <label>生效日<input name="effectiveFrom" type="date" required/></label>
      <label>薪資制度<select name="payBasis" defaultValue="monthly"><option value="monthly">月薪</option><option value="hourly">時薪</option></select></label>
      <label>薪資／時薪（元）<input name="rate" type="number" min="0" max="10000000" step="0.01" required/></label>
      <label>備註<input name="note" maxLength={200}/></label>
      <button className="admin-button">儲存版本</button>
    </form><div className="payroll-chip-list">{employees.map((employee) => { const compensation = latestComp.get(employee.id); const cents = compensation?.pay_basis === "hourly" ? compensation.hourly_rate_cents : compensation?.monthly_base_cents; return <span key={employee.id}>{employee.employee_no} {employee.full_name}：{compensation ? `${payBasisLabels[compensation.pay_basis as keyof typeof payBasisLabels]} ${formatMoney(cents ?? 0)}` : "待設定"}</span>; })}</div></section>

    <section className="admin-panel payroll-setup"><header><div><span className="admin-eyebrow">PERIOD</span><h2>建立薪資月份</h2><p>結算區間與預設發薪日由當時生效的後台設定計算；可個別指定發薪日。</p></div></header><form action={createPeriod}>
      <label>薪資月份<input name="periodMonth" type="month" required/></label>
      <label>發薪日（留空採設定）<input name="payDate" type="date"/></label>
      <button className="admin-button" disabled={!hasSettings}><Banknote size={15}/> 建立草稿</button>
    </form></section>

    {periods.length ? <nav className="payroll-period-tabs" aria-label="薪資月份">{periods.map((period) => <Link className={selected?.id === period.id ? "active" : undefined} href={`/admin/payroll?period=${period.id}`} key={period.id}>{period.period_month.slice(0, 7)}<small>{payrollStatusLabels[period.status]}</small></Link>)}</nav> : null}

    {selected ? <section className="admin-panel payroll-period"><header><div><span className="admin-eyebrow">SELECTED PERIOD</span><h2>{selected.period_month.slice(0, 7)} · {payrollStatusLabels[selected.status]}</h2><p>結算 {selected.period_start} 至 {selected.period_end} · 發薪 {selected.pay_date ?? "待設定"}</p>{selected.review_note ? <small>核對紀錄：{selected.review_note}</small> : null}</div><div className="payroll-actions">
      {selected.status === "draft" ? <form action={calculateDraft}><input type="hidden" name="periodId" value={selected.id}/><button className="admin-button"><Calculator size={15}/> {entries.length ? "重新試算" : "開始試算"}</button></form> : null}
      {selected.status === "reviewed" ? <><form action={changePeriodStatus}><input type="hidden" name="periodId" value={selected.id}/><button name="status" value="draft">退回草稿</button></form><form action={changePeriodStatus}><input type="hidden" name="periodId" value={selected.id}/><ConfirmSubmit className="admin-button" message="鎖定後薪資、項目與來源快照都不能修改。確定發布給員工？" name="status" value="locked"><LockKeyhole size={15}/> 鎖定並發布</ConfirmSubmit></form></> : null}
      {selected.status === "locked" ? <span className="status-pill">已鎖定並發布</span> : null}
    </div></header>
      {!entries.length ? <div className="admin-empty"><strong>尚未試算</strong><p>先確認每位員工薪資版本，再按「開始試算」。</p></div> : <div className="payroll-entry-list">{entries.map((entry) => {
        const employee = employeeById.get(entry.employee_id); const items = itemsByEntry.get(entry.id) ?? []; const snapshot = objectValue(entry.source_snapshot); const attendance = objectValue(snapshot.attendance);
        return <article key={entry.id}><div><strong>{employee?.employee_no ?? String(snapshot.employee_no ?? "—")} · {employee?.full_name ?? String(snapshot.employee_name ?? "未知員工")}</strong><span>應發 {formatMoney(entry.gross_cents)} · 扣款 {formatMoney(entry.deduction_cents)} · <b>實發 {formatMoney(entry.net_cents)}</b></span><small>出勤 {String(attendance.actual_minutes ?? 0)} 分鐘 · 加班 {String(attendance.approved_overtime_minutes ?? 0)} 分鐘 · 例外 {String(attendance.exception_count ?? 0)} 項</small>{snapshot.partial_period === true ? <small className="payroll-warning">本期含到職、離職或薪資異動，需人工確認比例。</small> : null}{!entry.compensation_version_id ? <small className="payroll-warning">缺少有效薪資設定，無法完成核對。</small> : null}</div><div className="payroll-item-stack">
          <ul>{items.map((item) => <li key={item.id}><span>{item.name}{item.note ? <small>{item.note}</small> : null}</span><strong>{item.kind === "deduction" ? "−" : "+"}{formatMoney(item.amount_cents)}</strong>{selected.status === "draft" && item.source === "manual" ? <form action={removeAdjustment}><input type="hidden" name="itemId" value={item.id}/><button aria-label={`刪除 ${item.name}`}><Trash2 size={14}/></button></form> : null}</li>)}</ul>
          {selected.status === "draft" ? <form action={addAdjustment} className="payroll-adjustment-form"><input type="hidden" name="entryId" value={entry.id}/><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()}/><select name="kind"><option value="earning">加項</option><option value="deduction">扣項</option></select><input name="name" placeholder="項目名稱" maxLength={40} required/><input name="amount" type="number" min="0.01" max="10000000" step="0.01" placeholder="金額" required/><input name="note" placeholder="備註" maxLength={200}/><button>新增調整</button></form> : null}
        </div></article>;
      })}</div>}
      {selected.status === "draft" && entries.length ? <form action={reviewPeriod} className="payroll-review-form"><input type="hidden" name="periodId" value={selected.id}/><label>核對說明<textarea name="reviewNote" minLength={10} maxLength={1000} placeholder="請記錄已核對的員工、出勤例外、人工加扣項與薪資設定（至少 10 字）" required/></label><button className="admin-button">完成逐筆核對</button></form> : null}
    </section> : null}
  </>;
}
