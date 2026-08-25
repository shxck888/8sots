import { AlertTriangle, ArrowLeft, Clock3, MapPin } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { attendanceExceptionLabels, attendanceStatusLabels } from "@/lib/attendance-contract";
import { locationVerificationLabels, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import { formatTaipeiDateTime } from "@/lib/schedule-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AttendanceDayDetailPage({ params }: {
  params: Promise<{ dayId: string }>;
}) {
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");
  const { dayId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: day, error } = await supabase.from("attendance_days").select("*")
    .eq("tenant_id", admin.tenantId).eq("id", dayId).maybeSingle();
  if (error || !day) notFound();

  const [employeeResult, runResult, segmentsResult, exceptionsResult, punchesResult, requestsResult] = await Promise.all([
    supabase.from("employees").select("employee_no, full_name").eq("tenant_id", admin.tenantId).eq("id", day.employee_id).maybeSingle(),
    supabase.from("attendance_calculation_runs").select("calculated_at, date_from, date_to").eq("tenant_id", admin.tenantId).eq("id", day.calculation_run_id).maybeSingle(),
    supabase.from("attendance_segments").select("*").eq("tenant_id", admin.tenantId).eq("attendance_day_id", day.id).order("segment_order"),
    supabase.from("attendance_exceptions").select("*").eq("tenant_id", admin.tenantId).eq("attendance_day_id", day.id).order("created_at"),
    supabase.from("punch_records").select("*").eq("tenant_id", admin.tenantId).eq("employee_id", day.employee_id).eq("work_date", day.work_date).order("occurred_at"),
    supabase.from("punch_correction_requests").select("*").eq("tenant_id", admin.tenantId).eq("employee_id", day.employee_id).eq("work_date", day.work_date).order("requested_at"),
  ]);
  const employee = employeeResult.data;
  const run = runResult.data;

  return (
    <>
      <Link className="admin-back-link" href="/admin/attendance"><ArrowLeft size={16} /> 返回出勤管理</Link>
      <header className="admin-page-header"><div><span className="admin-eyebrow">ATTENDANCE DAY</span><h1>{day.work_date} · {employee?.full_name ?? "未知員工"}</h1><p>{employee?.employee_no ?? day.employee_id.slice(0, 8)}｜快照建立於 {run ? formatTaipeiDateTime(run.calculated_at) : "未知"}</p></div><span className={`attendance-day-status ${day.status}`}>{attendanceStatusLabels[day.status]}</span></header>

      <section className="attendance-detail-stats"><article><small>排班工時</small><strong>{day.scheduled_minutes} 分</strong></article><article><small>實際工時</small><strong>{day.actual_minutes} 分</strong></article><article><small>異常</small><strong>{day.exception_count} 項</strong></article></section>

      <section className="admin-panel attendance-detail-panel"><header><div><span className="admin-eyebrow">SEGMENTS</span><h2>班段計算明細</h2></div></header>{segmentsResult.data?.length ? <div className="attendance-segment-list">{segmentsResult.data.map((segment) => <article key={segment.id}><div><span>第 {segment.segment_order} 段</span><strong>{formatTaipeiDateTime(segment.scheduled_start_at)}－{formatTaipeiDateTime(segment.scheduled_end_at)}</strong></div><div><small>有效上班</small><strong>{segment.effective_clock_in_at ? formatTaipeiDateTime(segment.effective_clock_in_at) : "缺卡"}</strong></div><div><small>有效下班</small><strong>{segment.effective_clock_out_at ? formatTaipeiDateTime(segment.effective_clock_out_at) : "缺卡"}</strong></div><div><small>實際</small><strong>{segment.actual_minutes} 分</strong><span>遲到 {segment.late_minutes}／早退 {segment.early_leave_minutes} 分</span></div></article>)}</div> : <div className="admin-empty"><Clock3 size={26} /><strong>沒有可計算班段</strong></div>}</section>

      <section className="admin-panel attendance-detail-panel"><header><div><span className="admin-eyebrow">EXCEPTIONS</span><h2>異常證據</h2></div></header>{exceptionsResult.data?.length ? <div className="attendance-exception-list">{exceptionsResult.data.map((item) => <article key={item.id}><AlertTriangle size={18} /><div><strong>{attendanceExceptionLabels[item.exception_type]}</strong><p>{item.minutes ? `${item.minutes} 分鐘` : "需要人工確認"}</p></div></article>)}</div> : <div className="admin-empty"><strong>本次快照沒有異常</strong></div>}</section>

      <section className="admin-panel attendance-detail-panel"><header><div><span className="admin-eyebrow">RAW EVIDENCE</span><h2>當日原始打卡</h2></div></header><div className="attendance-evidence-list">{punchesResult.data?.map((record) => <article key={record.id}><span className={`attendance-event ${record.event_type}`}>{punchEventLabels[record.event_type]}</span><div><strong>{formatTaipeiDateTime(record.occurred_at)}</strong><small>{punchSourceLabels[record.source]}</small></div><div><span><MapPin size={14} /> {locationVerificationLabels[record.location_verification]}</span><small>GPS 誤差約 {Number(record.accuracy_m ?? 0).toFixed(0)} 公尺</small></div></article>)}{!punchesResult.data?.length ? <div className="admin-empty"><strong>當日沒有原始打卡</strong></div> : null}</div></section>

      {requestsResult.data?.length ? <section className="admin-panel attendance-detail-panel"><header><div><span className="admin-eyebrow">CORRECTIONS</span><h2>補卡申請</h2></div></header><div className="attendance-exception-list">{requestsResult.data.map((request) => <article key={request.id}><Clock3 size={18} /><div><strong>{punchEventLabels[request.proposed_event_type]} · {formatTaipeiDateTime(request.proposed_occurred_at)}</strong><p>{request.reason}</p></div></article>)}</div></section> : null}
    </>
  );
}
