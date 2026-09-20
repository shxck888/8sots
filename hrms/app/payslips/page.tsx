import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { formatMoney } from "@/lib/payroll-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { PrintPayslipButton } from "./print-button";

export const dynamic = "force-dynamic";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function PayslipsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams;
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login?next=/payslips");
  const supabase = await createSupabaseServerClient();
  const periodResult = workspace.employeeId
    ? await supabase.from("payroll_periods").select("*").eq("tenant_id", workspace.tenantId!).eq("status", "locked").order("period_month", { ascending: false }).limit(36)
    : { data: [], error: null };
  const periods = periodResult.data ?? [];
  const period = periods.find((item) => item.id === params.period) ?? periods[0];
  const entryResult = period && workspace.employeeId
    ? await supabase.from("payroll_entries").select("*").eq("tenant_id", workspace.tenantId!).eq("payroll_period_id", period.id).eq("employee_id", workspace.employeeId).maybeSingle()
    : { data: null, error: null };
  const entry = entryResult.data;
  const itemResult = entry
    ? await supabase.from("payroll_items").select("*").eq("tenant_id", workspace.tenantId!).eq("payroll_entry_id", entry.id).order("created_at")
    : { data: [], error: null };
  const items = itemResult.data ?? [];
  const snapshot = objectValue(entry?.source_snapshot);
  const employeeName = String(snapshot.employee_name ?? workspace.displayName);
  const failed = periodResult.error || entryResult.error || itemResult.error;

  return <WorkspaceShell activePath="/payslips" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
    <header className="my-schedule-header no-print"><div><span className="date-label">PAYSLIP</span><h1>我的薪資單</h1><p>只顯示管理員已完成核對並鎖定發布的薪資結果。</p></div>{entry && period ? <PrintPayslipButton/> : null}</header>
    {periods.length > 1 ? <nav className="payslip-tabs no-print" aria-label="薪資月份">{periods.map((item) => <Link className={item.id === period?.id ? "active" : undefined} href={`/payslips?period=${item.id}`} key={item.id}>{item.period_month.slice(0, 7)}</Link>)}</nav> : null}
    {failed ? <div className="dashboard-empty"><ReceiptText size={28}/><strong>薪資單讀取失敗</strong><p>請稍後重新整理；若持續發生請聯絡管理員。</p></div> : !entry || !period ? <div className="dashboard-empty"><ReceiptText size={28}/><strong>目前沒有已發布薪資單</strong><p>草稿與核對中的金額不會顯示在員工端。</p></div> : <article className="payslip-sheet">
      <header><div><small>{workspace.tenantName}</small><h2>{period.period_month.slice(0, 7)} 薪資單</h2></div><div><small>員工</small><strong>{employeeName}</strong></div></header>
      <section className="payslip-period"><span>結算期間 {period.period_start} 至 {period.period_end}</span><span>發薪日 {period.pay_date ?? "—"}</span></section>
      <table><thead><tr><th>項目</th><th>類型</th><th>金額</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}{item.note ? <small>{item.note}</small> : null}</td><td>{item.kind === "earning" ? "加項" : "扣項"}</td><td>{item.kind === "deduction" ? "−" : "+"}{formatMoney(item.amount_cents)}</td></tr>)}</tbody></table>
      <section className="payslip-totals"><div><span>應發</span><strong>{formatMoney(entry.gross_cents)}</strong></div><div><span>扣款</span><strong>{formatMoney(entry.deduction_cents)}</strong></div><div className="net"><span>實發</span><strong>{formatMoney(entry.net_cents)}</strong></div></section>
      <footer>本薪資單為已鎖定快照。尚未設定的自動扣款、勞健保與稅務規則不會自行套用。</footer>
    </article>}
  </WorkspaceShell>;
}
