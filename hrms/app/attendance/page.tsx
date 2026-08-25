import { AlertTriangle, Clock3, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { CorrectionForm } from "@/app/attendance/correction-form";
import { WorkspaceShell } from "@/app/workspace-shell";
import { attendanceStatusLabels } from "@/lib/attendance-contract";
import { locationVerificationLabels, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import { getEmployeePunchContext } from "@/lib/punches";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function serverTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

export default async function AttendancePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const result = workspace.tenantId
    ? await getEmployeePunchContext({ limit: 60, tenantId: workspace.tenantId, userId: workspace.userId })
    : { employeeId: null, records: [] };
  const supabase = await createSupabaseServerClient();
  const [daysResult, requestsResult] = result.employeeId && workspace.tenantId ? await Promise.all([
    supabase.from("attendance_days").select("*").eq("tenant_id", workspace.tenantId)
      .eq("employee_id", result.employeeId).order("created_at", { ascending: false }).limit(31),
    supabase.from("punch_correction_requests").select("*").eq("tenant_id", workspace.tenantId)
      .eq("employee_id", result.employeeId).order("requested_at", { ascending: false }).limit(20),
  ]) : [{ data: [] }, { data: [] }];
  const requestIds = (requestsResult.data ?? []).map((request) => request.id);
  const decisionsResult = requestIds.length
    ? await supabase.from("punch_correction_decisions").select("*").in("correction_request_id", requestIds)
    : { data: [] };
  const decisions = new Map((decisionsResult.data ?? []).map((decision) => [decision.correction_request_id, decision]));

  return (
    <WorkspaceShell activePath="/attendance" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
      <header className="my-schedule-header"><div><span className="date-label">ATTENDANCE EVIDENCE</span><h1>出勤紀錄</h1><p>正式時間採用伺服器時間；原始紀錄建立後不可修改或刪除。</p></div></header>
      <CorrectionForm enabled={Boolean(result.employeeId)} />
      {(daysResult.data ?? []).length ? <section className="attendance-summary-list"><header><div><span className="eyebrow">CALCULATED</span><h2>每日出勤結果</h2></div><small>每次重算保留獨立快照</small></header>{(daysResult.data ?? []).map((day) => <article key={day.id}><strong>{day.work_date}</strong><span className={`attendance-day-status ${day.status}`}>{attendanceStatusLabels[day.status]}</span><span>排班 {day.scheduled_minutes} 分</span><span>實際 {day.actual_minutes} 分</span><em>{day.exception_count ? `${day.exception_count} 項異常` : "無異常"}</em></article>)}</section> : null}
      {(requestsResult.data ?? []).length ? <section className="attendance-summary-list"><header><div><span className="eyebrow">CORRECTIONS</span><h2>我的更正申請</h2></div></header>{(requestsResult.data ?? []).map((request) => { const decision = decisions.get(request.id); return <article key={request.id}><strong>{request.work_date}</strong><span>{punchEventLabels[request.proposed_event_type]} · {serverTime(request.proposed_occurred_at)}</span><span className={`correction-status ${decision?.decision ?? "pending"}`}>{decision?.decision === "approved" ? "已核准" : decision?.decision === "rejected" ? "已拒絕" : "待審核"}</span><em title={request.reason}>{request.reason}</em></article>; })}</section> : null}
      {!result.employeeId ? (
        <section className="my-schedule-empty"><Clock3 size={30} /><strong>此帳號尚未連結在職員工資料</strong><p>請聯絡管理員建立或連結員工登入帳號。</p></section>
      ) : result.records.length === 0 ? (
        <section className="my-schedule-empty"><Clock3 size={30} /><strong>尚無打卡紀錄</strong><p>回到工作台，同意使用定位後即可進行第一次上班打卡。</p></section>
      ) : (
        <section className="attendance-list" aria-label="個人打卡紀錄"><header className="attendance-list-heading"><div><span className="eyebrow">RAW EVIDENCE</span><h2>原始打卡</h2></div><span><AlertTriangle size={14} /> 不可修改</span></header>
          {result.records.map((record) => (
            <article key={record.id}>
              <span className={`attendance-event ${record.event_type}`}>{punchEventLabels[record.event_type]}</span>
              <div><strong>{serverTime(record.occurred_at)}</strong><small>工作日 {record.work_date} · {punchSourceLabels[record.source]}</small></div>
              <div className="attendance-evidence"><span><MapPin size={14} /> {locationVerificationLabels[record.location_verification]}</span><small>GPS 誤差約 {Number(record.accuracy_m ?? 0).toFixed(0)} 公尺</small></div>
            </article>
          ))}
        </section>
      )}
    </WorkspaceShell>
  );
}
