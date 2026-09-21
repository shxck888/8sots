import { Banknote, Calculator, MapPin, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { payBasisLabels, ppmToMultiplier, ppmToPercentage, workplaceModeLabels } from "@/lib/operations-settings";
import { savePayrollSettings, savePayrollStatutorySettings, saveWorkplaceSettings } from "./actions";

export const dynamic = "force-dynamic";

function todayTaipei() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

const errors: Record<string, string> = {
  "workplace-input": "門市設定格式不正確，請檢查座標、範圍與定位誤差。",
  "payroll-input": "薪資設定格式不正確，日期皆須為 1–31 日。",
  "statutory-input": "法定扣款或加班級距格式不正確，請檢查百分比、分鐘與來源說明。",
  permission: "你沒有維護這項設定的權限。",
  save: "設定儲存失敗，請稍後再試。",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const params = await searchParams;
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId || (!workspace.canManageSettings && !workspace.canManagePayroll)) redirect("/");
  const supabase = await createSupabaseServerClient();
  const [workplacesResult, payrollResult, statutoryResult] = await Promise.all([
    workspace.canManageSettings
      ? supabase.from("workplace_setting_versions").select("*").eq("tenant_id", workspace.tenantId).order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    workspace.canManagePayroll
      ? supabase.from("payroll_rule_versions").select("*").eq("tenant_id", workspace.tenantId).order("effective_from", { ascending: false }).order("version", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
    workspace.canManagePayroll
      ? supabase.from("payroll_statutory_rule_versions").select("*").eq("tenant_id", workspace.tenantId).order("effective_from", { ascending: false }).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const workplaces = workplacesResult.data ?? [];
  const payrollRules = payrollResult.data ?? [];
  const latestWorkplace = workplaces[0];
  const latestPayroll = payrollRules[0];
  const statutoryRules = statutoryResult.data ?? [];
  const latestStatutory = statutoryRules[0];
  const latestRules = latestPayroll?.rules && typeof latestPayroll.rules === "object" && !Array.isArray(latestPayroll.rules) ? latestPayroll.rules : {};
  const today = todayTaipei();

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">OPERATIONS SETTINGS</span><h1>系統設定</h1><p>門市打卡與薪資規則皆以生效日建立版本；舊版保留，歷史結果不會被新版設定覆寫。</p></div></header>
    {params.saved ? <div className="admin-success">已建立新版{params.saved === "workplace" ? "門市打卡" : params.saved === "statutory" ? "法定扣款與加班" : "薪資週期"}設定。</div> : null}
    {params.error ? <div className="admin-form-error schedule-message">{errors[params.error] ?? errors.save}</div> : null}

    {workspace.canManageSettings ? <section className="admin-panel settings-panel">
      <header><div><span className="admin-eyebrow">WORKPLACE</span><h2><MapPin size={19}/> 門市與打卡範圍</h2><p>「強制範圍」啟用後，超出距離或定位精度不足會拒絕打卡。</p></div></header>
      <form action={saveWorkplaceSettings} className="settings-form">
        <label>生效日<input name="effectiveFrom" type="date" defaultValue={today} required/></label>
        <label>門市名稱<input name="name" defaultValue={latestWorkplace?.name ?? ""} maxLength={120} required/></label>
        <label className="settings-wide">門市地址<input name="address" defaultValue={latestWorkplace?.address ?? ""} maxLength={300} required/></label>
        <label>緯度<input name="latitude" type="number" step="0.000001" min="-90" max="90" defaultValue={latestWorkplace?.latitude ?? ""} required/></label>
        <label>經度<input name="longitude" type="number" step="0.000001" min="-180" max="180" defaultValue={latestWorkplace?.longitude ?? ""} required/></label>
        <label>允許半徑（公尺）<input name="radiusM" type="number" min="10" max="5000" defaultValue={latestWorkplace?.radius_m ?? 150} required/></label>
        <label>最大定位誤差（公尺）<input name="maxAccuracyM" type="number" min="1" max="1000" defaultValue={latestWorkplace?.max_accuracy_m ?? 100} required/></label>
        <label className="settings-wide">驗證模式<select name="mode" defaultValue={latestWorkplace?.mode ?? "evidence"}><option value="evidence">{workplaceModeLabels.evidence}</option><option value="enforced">{workplaceModeLabels.enforced}</option></select></label>
        <button className="admin-button primary" type="submit"><ShieldCheck size={16}/> 建立新版門市設定</button>
      </form>
      {workplacesResult.error ? <p className="settings-error">門市設定讀取失敗。</p> : <ul className="settings-history">{workplaces.map((item) => <li key={item.id}><strong>{item.name}</strong><span>{item.effective_from} 起 · {workplaceModeLabels[item.mode as keyof typeof workplaceModeLabels]} · 半徑 {item.radius_m}m · 誤差上限 {item.max_accuracy_m}m</span><small>{item.address}（{item.latitude}, {item.longitude}）</small></li>)}</ul>}
    </section> : null}

    {workspace.canManagePayroll ? <section className="admin-panel settings-panel">
      <header><div><span className="admin-eyebrow">PAYROLL PERIOD</span><h2><Banknote size={19}/> 薪資週期設定</h2><p>結算日與發薪日遇到短月份時，自動採該月最後一天。</p></div></header>
      <form action={savePayrollSettings} className="settings-form">
        <label>生效日<input name="effectiveFrom" type="date" defaultValue={today} required/></label>
        <label>每月結算日<input name="closingDay" type="number" min="1" max="31" defaultValue={Number(latestRules.closing_day ?? 31)} required/></label>
        <label>發薪日<input name="payDay" type="number" min="1" max="31" defaultValue={Number(latestRules.pay_day ?? 5)} required/></label>
        <label>發薪月份<select name="payMonthOffset" defaultValue={String(latestRules.pay_month_offset ?? 1)}><option value="0">結算當月</option><option value="1">結算次月</option><option value="2">結算後第二個月</option></select></label>
        <label>預設薪資制度<select name="defaultBasis" defaultValue={String(latestRules.default_basis ?? "monthly")}><option value="monthly">月薪</option><option value="hourly">時薪</option></select></label>
        <label className="settings-wide">版本備註<input name="note" maxLength={500} placeholder="例如：2026 年正式薪資週期"/></label>
        <button className="admin-button primary" type="submit"><Banknote size={16}/> 建立新版薪資設定</button>
      </form>
      {payrollResult.error ? <p className="settings-error">薪資設定讀取失敗。</p> : <ul className="settings-history">{payrollRules.map((item) => { const rule = item.rules && typeof item.rules === "object" && !Array.isArray(item.rules) ? item.rules : {}; return <li key={item.id}><strong>V{item.version} · {payBasisLabels[String(rule.default_basis) as keyof typeof payBasisLabels] ?? "未指定"}</strong><span>{item.effective_from} 起 · 每月 {String(rule.closing_day)} 日結算 · {Number(rule.pay_month_offset) === 0 ? "當月" : Number(rule.pay_month_offset) === 1 ? "次月" : "後第二個月"} {String(rule.pay_day)} 日發薪</span>{item.source_note ? <small>{item.source_note}</small> : null}</li>; })}</ul>}
    </section> : null}

    {workspace.canManagePayroll ? <section className="admin-panel settings-panel">
      <header><div><span className="admin-eyebrow">STATUTORY PAYROLL</span><h2><Calculator size={19}/> 法定扣款與加班計薪</h2><p>費率不寫死在程式中。請依官方級距與公司適用情況建立生效日版本；已鎖定薪資仍保留當時快照。</p></div></header>
      {!latestStatutory ? <div className="attendance-recalc-alert"><ShieldCheck size={20}/><div><strong>尚未啟用自動法定扣款</strong><p>建立版本前，薪資草稿會顯示阻擋核對，不會自行猜測費率。</p></div></div> : null}
      <form action={savePayrollStatutorySettings} className="settings-form">
        <label>生效日<input name="effectiveFrom" type="date" defaultValue={today} required/></label>
        <label>勞保普通事故費率（%）<input name="laborInsuranceRate" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.labor_insurance_rate_ppm)} required/></label>
        <label>勞保員工負擔（%）<input name="laborEmployeeShare" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.labor_employee_share_ppm)} required/></label>
        <label>就保費率（%）<input name="employmentInsuranceRate" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.employment_insurance_rate_ppm)} required/></label>
        <label>就保員工負擔（%）<input name="employmentEmployeeShare" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.employment_employee_share_ppm)} required/></label>
        <label>健保費率（%）<input name="healthInsuranceRate" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.health_insurance_rate_ppm)} required/></label>
        <label>健保員工負擔（%）<input name="healthEmployeeShare" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.health_employee_share_ppm)} required/></label>
        <label>雇主勞退提繳（%）<input name="pensionEmployerRate" type="number" min="0" max="100" step="0.0001" defaultValue={ppmToPercentage(latestStatutory?.pension_employer_rate_ppm)} required/></label>
        <label>月薪時薪換算除數<input name="monthlyHourDivisor" type="number" min="1" max="744" defaultValue={latestStatutory?.monthly_hour_divisor ?? 240} required/></label>
        <label>加班第 1 級分鐘<input name="overtimeTier1Minutes" type="number" min="0" max="480" defaultValue={latestStatutory?.overtime_tier_1_minutes ?? 120} required/></label>
        <label>第 1 級倍數<input name="overtimeTier1Multiplier" type="number" min="1" max="5" step="0.000001" defaultValue={ppmToMultiplier(latestStatutory?.overtime_tier_1_multiplier_ppm ?? 1_333_333)} required/></label>
        <label>加班第 2 級分鐘<input name="overtimeTier2Minutes" type="number" min="0" max="480" defaultValue={latestStatutory?.overtime_tier_2_minutes ?? 120} required/></label>
        <label>第 2 級倍數<input name="overtimeTier2Multiplier" type="number" min="1" max="5" step="0.000001" defaultValue={ppmToMultiplier(latestStatutory?.overtime_tier_2_multiplier_ppm ?? 1_666_667)} required/></label>
        <label>加班第 3 級分鐘<input name="overtimeTier3Minutes" type="number" min="0" max="480" defaultValue={latestStatutory?.overtime_tier_3_minutes ?? 0} required/></label>
        <label>第 3 級倍數<input name="overtimeTier3Multiplier" type="number" min="1" max="5" step="0.000001" defaultValue={ppmToMultiplier(latestStatutory?.overtime_tier_3_multiplier_ppm ?? 2_000_000)} required/></label>
        <label className="settings-wide">法規／計算依據<input name="sourceNote" minLength={5} maxLength={500} defaultValue={latestStatutory?.source_note ?? ""} placeholder="例如：依 2026 年官方費率表及公司適用身分設定" required/></label>
        <button className="admin-button primary" type="submit"><Calculator size={16}/> 建立新版法定計薪設定</button>
      </form>
      {statutoryResult.error ? <p className="settings-error">法定計薪設定讀取失敗。</p> : <ul className="settings-history">{statutoryRules.map((item) => <li key={item.id}><strong>{item.effective_from} 起 · 月薪除數 {item.monthly_hour_divisor}</strong><span>勞保 {ppmToPercentage(item.labor_insurance_rate_ppm)}% × 員工 {ppmToPercentage(item.labor_employee_share_ppm)}% · 就保 {ppmToPercentage(item.employment_insurance_rate_ppm)}% × 員工 {ppmToPercentage(item.employment_employee_share_ppm)}% · 健保 {ppmToPercentage(item.health_insurance_rate_ppm)}% × 員工 {ppmToPercentage(item.health_employee_share_ppm)}%</span><small>{item.source_note}</small></li>)}</ul>}
    </section> : null}
  </>;
}
