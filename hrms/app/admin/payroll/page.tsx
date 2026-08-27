import { Banknote, Calculator, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { formatMoney, payrollStatusLabels } from "@/lib/payroll-contract";
import { addAdjustment, calculateDraft, changePeriodStatus, createPeriod, saveCompensation } from "./actions";

export const dynamic = "force-dynamic";
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams; const workspace = await getWorkspaceContext(); if (!workspace?.tenantId) redirect("/");
  const supabase = await createSupabaseServerClient(); const { data: allowed } = await supabase.rpc("current_user_has_permission", { p_permission_code: "payroll.manage", p_tenant_id: workspace.tenantId }); if (!allowed) redirect("/");
  const [{ data: employees }, { data: periods }, { data: compensations }] = await Promise.all([
    supabase.from("employees").select("id,employee_no,full_name").eq("tenant_id",workspace.tenantId).order("employee_no"),
    supabase.from("payroll_periods").select("*").eq("tenant_id",workspace.tenantId).order("period_month",{ascending:false}).limit(18),
    supabase.from("employee_compensation_versions").select("*").eq("tenant_id",workspace.tenantId).order("effective_from",{ascending:false}),
  ]);
  const selected = periods?.[0]; const { data: entries } = selected ? await supabase.from("payroll_entries").select("*").eq("payroll_period_id",selected.id).order("employee_id") : { data: [] };
  const employeeById = new Map((employees??[]).map(e=>[e.id,e])); const latestComp = new Map<string, NonNullable<typeof compensations>[number]>(); for(const c of compensations??[]) if(!latestComp.has(c.employee_id)) latestComp.set(c.employee_id,c);
  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">PAYROLL DRAFT</span><h1>薪資管理</h1><p>先產生可核對草稿；尚未設定的扣薪、保險與稅務規則不會自動套用。</p></div></header>
    {params.saved?<div className="admin-success">薪資資料已更新。</div>:null}{params.error?<div className="admin-form-error">操作失敗；請確認資料完整、月份未重複且狀態允許。</div>:null}
    <section className="admin-panel payroll-setup"><header><div><span className="admin-eyebrow">COMPENSATION</span><h2>員工薪資設定</h2></div></header><form action={saveCompensation}><select name="employeeId" required defaultValue=""><option value="" disabled>選擇員工</option>{employees?.map(e=><option key={e.id} value={e.id}>{e.employee_no} · {e.full_name}</option>)}</select><input name="effectiveFrom" type="date" required/><input name="monthlyBase" type="number" min="0" step="1" placeholder="月薪（元）" required/><input name="note" maxLength={200} placeholder="備註（選填）"/><button className="admin-button">儲存版本</button></form><div className="payroll-chip-list">{employees?.map(e=><span key={e.id}>{e.employee_no} {e.full_name}：{latestComp.get(e.id)?formatMoney(latestComp.get(e.id)!.monthly_base_cents):"待設定"}</span>)}</div></section>
    <section className="admin-panel payroll-setup"><header><div><span className="admin-eyebrow">PERIOD</span><h2>建立月薪週期</h2></div></header><form action={createPeriod}><input name="periodMonth" type="month" required/><input name="payDate" type="date" required/><button className="admin-button"><Banknote size={15}/> 建立草稿</button></form></section>
    {selected?<section className="admin-panel payroll-period"><header><div><span className="admin-eyebrow">CURRENT PERIOD</span><h2>{selected.period_month.slice(0,7)} · {payrollStatusLabels[selected.status]}</h2><p>結算 {selected.period_start} 至 {selected.period_end} · 發薪 {selected.pay_date??"待設定"}</p></div><div className="payroll-actions">{selected.status==="draft"?<><form action={calculateDraft}><input type="hidden" name="periodId" value={selected.id}/><button className="admin-button"><Calculator size={15}/> 重新試算</button></form><form action={changePeriodStatus}><input type="hidden" name="periodId" value={selected.id}/><button name="status" value="reviewed">完成核對</button></form></>:selected.status==="reviewed"?<><form action={changePeriodStatus}><input type="hidden" name="periodId" value={selected.id}/><button name="status" value="draft">退回草稿</button></form><form action={changePeriodStatus}><input type="hidden" name="periodId" value={selected.id}/><button className="admin-button" name="status" value="locked"><LockKeyhole size={15}/> 鎖定薪資</button></form></>:<span className="status-pill">已鎖定</span>}</div></header>
      {!entries?.length?<div className="admin-empty"><strong>尚未試算</strong><p>先確認每位員工薪資設定，再按「重新試算」。</p></div>:<div className="payroll-entry-list">{entries.map(entry=>{const e=employeeById.get(entry.employee_id);return <article key={entry.id}><div><strong>{e?.employee_no} · {e?.full_name}</strong><span>應發 {formatMoney(entry.gross_cents)} · 扣款 {formatMoney(entry.deduction_cents)} · <b>實發 {formatMoney(entry.net_cents)}</b></span>{!entry.compensation_version_id?<small>缺少有效薪資設定，無法完成核對。</small>:null}</div>{selected.status==="draft"?<form action={addAdjustment}><input type="hidden" name="entryId" value={entry.id}/><select name="kind"><option value="earning">加項</option><option value="deduction">扣項</option></select><input name="name" placeholder="項目名稱" required/><input name="amount" type="number" min="1" step="1" placeholder="金額" required/><input name="note" placeholder="備註"/><button>新增調整</button></form>:null}</article>})}</div>}
    </section>:null}
  </>;
}
