import { AlertTriangle, Calculator, Check, Clock3, MapPin, X } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { attendanceExceptionLabels, attendanceStatusLabels } from "@/lib/attendance-contract";
import { locationVerificationLabels, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import { formatTaipeiDateTime, taipeiDateKey } from "@/lib/schedule-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateAttendance, decideCorrection } from "./actions";

export const dynamic = "force-dynamic";

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function AdminAttendancePage({ searchParams }: {
  searchParams: Promise<{ calculated?: string; decided?: string; error?: string }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: records, error } = await supabase.from("punch_records").select("*")
    .eq("tenant_id", admin.tenantId).order("occurred_at", { ascending: false }).limit(200);
  const employeeIds = [...new Set((records ?? []).map((record) => record.employee_id))];
  const employeesResult = employeeIds.length
    ? await supabase.from("employees").select("id, employee_no, full_name").eq("tenant_id", admin.tenantId).in("id", employeeIds)
    : { data: [], error: null };
  const employees = new Map((employeesResult.data ?? []).map((employee) => [employee.id, employee]));
  const [{ data: latestRun }, { data: correctionRequests }] = await Promise.all([
    supabase.from("attendance_calculation_runs").select("*").eq("tenant_id", admin.tenantId)
      .order("calculated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("punch_correction_requests").select("*").eq("tenant_id", admin.tenantId)
      .order("requested_at", { ascending: false }).limit(50),
  ]);
  const daysResult = latestRun
    ? await supabase.from("attendance_days").select("*").eq("tenant_id", admin.tenantId)
      .eq("calculation_run_id", latestRun.id).order("work_date", { ascending: false })
    : { data: [], error: null };
  const dayIds = (daysResult.data ?? []).map((day) => day.id);
  const exceptionsResult = dayIds.length
    ? await supabase.from("attendance_exceptions").select("*").in("attendance_day_id", dayIds)
    : { data: [], error: null };
  const exceptionsByDay = new Map<string, typeof exceptionsResult.data>();
  for (const exception of exceptionsResult.data ?? []) {
    exceptionsByDay.set(exception.attendance_day_id, [...(exceptionsByDay.get(exception.attendance_day_id) ?? []), exception]);
  }
  const correctionIds = (correctionRequests ?? []).map((request) => request.id);
  const decisionResult = correctionIds.length
    ? await supabase.from("punch_correction_decisions").select("*").in("correction_request_id", correctionIds)
    : { data: [], error: null };
  const decisionByRequest = new Map((decisionResult.data ?? []).map((decision) => [decision.correction_request_id, decision]));
  const correctionEmployeeIds = [...new Set((correctionRequests ?? []).map((request) => request.employee_id))];
  if (correctionEmployeeIds.length) {
    const { data: correctionEmployees } = await supabase.from("employees").select("id, employee_no, full_name")
      .eq("tenant_id", admin.tenantId).in("id", correctionEmployeeIds);
    for (const employee of correctionEmployees ?? []) employees.set(employee.id, employee);
  }
  const today = taipeiDateKey();

  return (
    <>
      <header className="admin-page-header"><div><span className="admin-eyebrow">ATTENDANCE</span><h1>出勤與打卡</h1><p>計算結果採獨立快照；原始打卡只讀且不可變更。</p></div></header>
      {params.calculated ? <div className="admin-success">每日出勤已建立新的計算快照。</div> : null}
      {params.decided ? <div className="admin-success">更正申請已完成審核；請重新計算受影響日期。</div> : null}
      {params.error ? <div className="admin-form-error">操作失敗，請確認日期範圍、權限與資料狀態。</div> : null}
      <section className="attendance-calculate admin-panel"><div><Calculator size={24} /><div><strong>產生出勤快照</strong><p>以已發布班表、原始 Punch、已核准更正及規則 V1（寬限 0 分鐘）重算。</p></div></div><form action={calculateAttendance}><label>開始<input defaultValue={addDays(today, -6)} name="dateFrom" required type="date" /></label><label>結束<input defaultValue={today} name="dateTo" required type="date" /></label><button className="admin-button" type="submit"><Calculator size={15} /> 計算</button></form></section>
      {latestRun ? <section className="admin-panel attendance-results"><header><div><span className="admin-eyebrow">LATEST SNAPSHOT</span><h2>{latestRun.date_from} — {latestRun.date_to}</h2></div><small>{formatTaipeiDateTime(latestRun.calculated_at)}</small></header><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>工作日</th><th>員工</th><th>狀態</th><th>排班</th><th>實際</th><th>異常</th></tr></thead><tbody>{(daysResult.data ?? []).map((day) => { const employee = employees.get(day.employee_id); const dayExceptions = exceptionsByDay.get(day.id) ?? []; return <tr key={day.id}><td>{day.work_date}</td><td>{employee?.full_name ?? "未知員工"}<br /><code>{employee?.employee_no ?? day.employee_id.slice(0, 8)}</code></td><td><span className={`attendance-day-status ${day.status}`}>{attendanceStatusLabels[day.status]}</span></td><td>{day.scheduled_minutes} 分</td><td>{day.actual_minutes} 分</td><td>{dayExceptions.length ? dayExceptions.map((item) => <span className="exception-chip" key={item.id}>{attendanceExceptionLabels[item.exception_type]}{item.minutes ? ` ${item.minutes} 分` : ""}</span>) : "—"}</td></tr>; })}</tbody></table></div></section> : null}
      <section className="admin-panel correction-review"><header><div><span className="admin-eyebrow">CORRECTIONS</span><h2>打卡更正審核</h2></div></header>{!correctionRequests?.length ? <div className="admin-empty"><Check size={28} /><strong>目前沒有更正申請</strong></div> : <div className="correction-review-list">{correctionRequests.map((request) => { const employee = employees.get(request.employee_id); const decision = decisionByRequest.get(request.id); return <article key={request.id}><div><strong>{employee?.full_name ?? "未知員工"} · {request.work_date}</strong><span>{punchEventLabels[request.proposed_event_type]} {formatTaipeiDateTime(request.proposed_occurred_at)}</span><p>{request.reason}</p></div>{decision ? <span className={`correction-status ${decision.decision}`}>{decision.decision === "approved" ? "已核准" : "已拒絕"}</span> : <form action={decideCorrection}><input name="requestId" type="hidden" value={request.id} /><input maxLength={500} name="reviewNote" placeholder="審核備註（選填）" /><button className="approve" name="decision" type="submit" value="approved"><Check size={14} /> 核准</button><button className="reject" name="decision" type="submit" value="rejected"><X size={14} /> 拒絕</button></form>}</article>; })}</div>}</section>
      <header className="admin-page-header compact"><div><span className="admin-eyebrow">RAW EVIDENCE</span><h1>原始打卡紀錄</h1><p><AlertTriangle size={13} /> 每筆時間與 GPS 證據由伺服器留存。</p></div></header>
      <section className="admin-panel">
        {error || employeesResult.error ? <div className="admin-empty"><strong>打卡紀錄讀取失敗</strong><p>請確認最新 database migration 已完成。</p></div> : !records?.length ? <div className="admin-empty"><Clock3 size={30} /><strong>尚無打卡紀錄</strong><p>員工完成 GPS 打卡後會顯示在這裡。</p></div> : (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>伺服器時間</th><th>員工</th><th>事件</th><th>工作日</th><th>來源</th><th>定位證據</th><th>驗證</th></tr></thead><tbody>
            {records.map((record) => { const employee = employees.get(record.employee_id); return <tr key={record.id}><td><strong>{formatTaipeiDateTime(record.occurred_at)}</strong></td><td>{employee?.full_name ?? "未知員工"}<br /><code>{employee?.employee_no ?? record.employee_id.slice(0, 8)}</code></td><td><span className={`attendance-event ${record.event_type}`}>{punchEventLabels[record.event_type]}</span></td><td>{record.work_date}</td><td>{punchSourceLabels[record.source]}</td><td><MapPin size={13} /> {Number(record.latitude).toFixed(5)}, {Number(record.longitude).toFixed(5)}<br /><small>誤差約 {Number(record.accuracy_m).toFixed(0)} m</small></td><td>{locationVerificationLabels[record.location_verification]}</td></tr>; })}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}
