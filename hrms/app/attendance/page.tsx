import { punchActionLabels, punchActionSchema } from "@/lib/punch-flow";
import { AlertTriangle, Clock3, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { CorrectionForm } from "@/app/attendance/correction-form";
import { WorkspaceShell } from "@/app/workspace-shell";
import { attendanceStatusLabels } from "@/lib/attendance-contract";
import { getMyAttendanceOverview } from "@/lib/attendance-overview";
import { getMyPublishedSchedule } from "@/lib/my-schedule";
import { locationVerificationLabels, punchDisplayLabel, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import { formatTaipeiDateTime } from "@/lib/schedule-display";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const overview = workspace.employeeId ? await getMyAttendanceOverview() : { days: [], punches: [], requests: [] };
  const dayByWorkDate = new Map(overview.days.map((day) => [day.work_date, day]));
  const punchesByWorkDate = new Map<string, typeof overview.punches>();
  for (const punch of overview.punches) {
    punchesByWorkDate.set(punch.work_date, [...(punchesByWorkDate.get(punch.work_date) ?? []), punch]);
  }
  const workDates = [...new Set([...dayByWorkDate.keys(), ...punchesByWorkDate.keys()])].sort().reverse();
  const schedule = workDates.length && workspace.employeeId
    ? await getMyPublishedSchedule({ dateFrom: workDates[workDates.length - 1], dateTo: workDates[0], employeeId: workspace.employeeId })
    : { entries: [] };
  const lunchByWorkDate = new Map(schedule.entries.map((entry) => [
    entry.workDate, entry.shiftCode === "WEEKDAY_SPLIT" && entry.segments.length === 2,
  ]));

  return (
    <WorkspaceShell activePath="/attendance" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
      <header className="my-schedule-header attendance-page-header"><div><h1>出勤紀錄</h1><p>每日結果與原始打卡集中顯示；正式時間採用伺服器時間。</p></div><CorrectionForm enabled={Boolean(workspace.employeeId)} /></header>
      {overview.requests.length ? <section className="attendance-summary-list"><header><div><h2>我的更正申請</h2></div></header>{overview.requests.map((request) => <article key={request.id}><strong>{request.work_date}</strong><span>{(punchActionSchema.safeParse(request.punch_action).success ? punchActionLabels[request.punch_action as keyof typeof punchActionLabels] : punchEventLabels[request.proposed_event_type])} · {formatTaipeiDateTime(request.proposed_occurred_at)}</span><span className={`correction-status ${request.decision ?? "pending"}`}>{request.decision === "approved" ? "已核准" : request.decision === "rejected" ? "已拒絕" : "待審核"}</span><em title={request.reason}>{request.reason}</em></article>)}</section> : null}
      {!workspace.employeeId ? (
        <section className="my-schedule-empty"><Clock3 size={30} /><strong>此帳號尚未連結在職員工資料</strong><p>請聯絡管理員建立或連結員工登入帳號。</p></section>
      ) : workDates.length === 0 ? (
        <section className="my-schedule-empty"><Clock3 size={30} /><strong>尚無打卡紀錄</strong><p>回到工作台，同意使用定位後即可進行第一次上班打卡。</p></section>
      ) : (
        <section aria-label="每日出勤與原始打卡" className="attendance-daily-list">
          <header className="attendance-list-heading"><div><h2>每日出勤結果與原始打卡</h2></div><span><AlertTriangle size={14} /> 原始打卡不可修改</span></header>
          {workDates.map((workDate) => {
            const day = dayByWorkDate.get(workDate);
            const punches = punchesByWorkDate.get(workDate) ?? [];
            const chronologicalPunches = [...punches].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at));
            return <article className="attendance-daily-card" key={workDate}>
              <div className="attendance-daily-result">
                <strong>{workDate}</strong>
                {day ? <><span className={`attendance-day-status ${day.status}`}>{attendanceStatusLabels[day.status]}</span><dl><div><dt>排班</dt><dd>{day.scheduled_minutes} 分</dd></div><div><dt>實際</dt><dd>{day.actual_minutes} 分</dd></div></dl><em>{day.exception_count ? `${day.exception_count} 項異常` : "無異常"}</em></> : <><span className="attendance-day-status pending">尚未計算</span><em>等待管理員產生出勤結果</em></>}
              </div>
              <div className="attendance-daily-punches">
                {punches.length ? punches.map((record) => <div className="attendance-daily-punch" key={record.id}>
                  <span className={`attendance-event ${record.event_type}`}>{(punchActionSchema.safeParse(record.punch_action).success ? punchActionLabels[record.punch_action as keyof typeof punchActionLabels] : punchDisplayLabel(record.event_type, chronologicalPunches.findIndex((item) => item.id === record.id), lunchByWorkDate.get(workDate) === true))}</span>
                  <div><strong>{formatTaipeiDateTime(record.occurred_at)}</strong><small>{punchSourceLabels[record.source]}</small></div>
                  <div className="attendance-evidence">
                    <span><MapPin size={14} /> {record.source === "qr" ? "已驗證授權機器" : locationVerificationLabels[record.location_verification]}</span>
                    {record.source === "web_gps" && record.accuracy_m != null ? <small><span className="attendance-gps-accuracy">GPS 誤差約 {Number(record.accuracy_m).toFixed(0)} 公尺</span>{record.location_distance_m != null ? ` · 距門市約 ${Number(record.location_distance_m).toFixed(0)} 公尺` : ""}</small> : null}
                  </div>
                </div>) : <p className="attendance-no-punch">此工作日沒有原始打卡</p>}
              </div>
            </article>;
          })}
        </section>
      )}
    </WorkspaceShell>
  );
}
