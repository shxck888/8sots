import { ReceiptText } from "lucide-react";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { formatMoney } from "@/lib/payroll-contract";
import { PrintPayslipButton } from "./print-button";

export const dynamic = "force-dynamic";
export default async function PayslipsPage() {
  const workspace = await getWorkspaceContext(); if (!workspace) redirect("/login?next=/payslips");
  const supabase = await createSupabaseServerClient();
  const { data: entries } = workspace.employeeId ? await supabase.from("payroll_entries").select("*").eq("employee_id",workspace.employeeId).order("created_at",{ascending:false}) : { data: [] };
  const entry = entries?.[0]; const { data: period } = entry ? await supabase.from("payroll_periods").select("*").eq("id",entry.payroll_period_id).eq("status","locked").maybeSingle() : { data: null };
  const { data: items } = entry && period ? await supabase.from("payroll_items").select("*").eq("payroll_entry_id",entry.id).order("created_at") : { data: [] };
  return <WorkspaceShell activePath="/payslips" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
    <header className="my-schedule-header no-print"><div><span className="date-label">PAYSLIP</span><h1>我的薪資單</h1><p>只顯示管理員已核對並鎖定的薪資結果。</p></div>{entry&&period?<PrintPayslipButton/>:null}</header>
    {!entry||!period?<div className="dashboard-empty"><ReceiptText size={28}/><strong>目前沒有已發布薪資單</strong><p>草稿與核對中的金額不會顯示在員工端。</p></div>:<article className="payslip-sheet">
      <header><div><small>{workspace.tenantName}</small><h2>{period.period_month.slice(0,7)} 薪資單</h2></div><div><small>員工</small><strong>{workspace.displayName}</strong></div></header>
      <section className="payslip-period"><span>結算期間 {period.period_start} 至 {period.period_end}</span><span>發薪日 {period.pay_date??"—"}</span></section>
      <table><thead><tr><th>項目</th><th>類型</th><th>金額</th></tr></thead><tbody>{items?.map(item=><tr key={item.id}><td>{item.name}{item.note?<small>{item.note}</small>:null}</td><td>{item.kind==="earning"?"加項":"扣項"}</td><td>{formatMoney(item.amount_cents)}</td></tr>)}</tbody></table>
      <section className="payslip-totals"><div><span>應發</span><strong>{formatMoney(entry.gross_cents)}</strong></div><div><span>扣款</span><strong>{formatMoney(entry.deduction_cents)}</strong></div><div className="net"><span>實發</span><strong>{formatMoney(entry.net_cents)}</strong></div></section>
      <footer>本薪資單為已鎖定快照。出勤、請假與加班資料僅作核對來源；尚未設定的自動扣款、勞健保與稅務規則未套用。</footer>
    </article>}
  </WorkspaceShell>;
}
