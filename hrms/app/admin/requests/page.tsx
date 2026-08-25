import { Check, ClipboardCheck, X } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { formatTaipeiDateTime } from "@/lib/schedule-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatRequestedMinutes, workRequestDecisionLabels, workRequestTypeLabels } from "@/lib/work-request-contract";
import { decideWorkRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({ searchParams }: {
  searchParams: Promise<{ decided?: string; error?: string }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext("request.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: requests, error } = await supabase.from("work_requests").select("*").eq("tenant_id", admin.tenantId).order("requested_at", { ascending: false }).limit(100);
  const requestIds = (requests ?? []).map((item) => item.id);
  const employeeIds = [...new Set((requests ?? []).map((item) => item.employee_id))];
  const leaveTypeIds = [...new Set((requests ?? []).flatMap((item) => item.leave_type_id ? [item.leave_type_id] : []))];
  const [{ data: decisions }, { data: employees }, { data: leaveTypes }] = await Promise.all([
    requestIds.length ? supabase.from("work_request_decisions").select("*").in("work_request_id", requestIds) : Promise.resolve({ data: [] }),
    employeeIds.length ? supabase.from("employees").select("id, employee_no, full_name").eq("tenant_id", admin.tenantId).in("id", employeeIds) : Promise.resolve({ data: [] }),
    leaveTypeIds.length ? supabase.from("leave_types").select("*").eq("tenant_id", admin.tenantId).in("id", leaveTypeIds) : Promise.resolve({ data: [] }),
  ]);
  const decisionByRequest = new Map((decisions ?? []).map((item) => [item.work_request_id, item]));
  const employeeById = new Map((employees ?? []).map((item) => [item.id, item]));
  const leaveTypeById = new Map((leaveTypes ?? []).map((item) => [item.id, item]));
  const sorted = [...(requests ?? [])].sort((a, b) => Number(Boolean(decisionByRequest.get(a.id))) - Number(Boolean(decisionByRequest.get(b.id))));

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">APPROVALS</span><h1>申請審核</h1><p>審核員工請假與加班；原始申請與決定均保留稽核紀錄。</p></div></header>
    {params.decided ? <div className="admin-success">申請已完成審核。</div> : null}
    {params.error ? <div className="admin-form-error">審核失敗，申請可能已被其他管理員處理。</div> : null}
    <section className="admin-panel correction-review work-request-review"><header><div><span className="admin-eyebrow">REQUEST QUEUE</span><h2>請假與加班</h2></div><small>{sorted.filter((item) => !decisionByRequest.has(item.id)).length} 筆待審</small></header>
      {error ? <div className="admin-empty"><strong>申請資料讀取失敗</strong><p>請確認最新 database migration 已完成。</p></div> : !sorted.length ? <div className="admin-empty"><ClipboardCheck size={28} /><strong>目前沒有申請</strong></div> : <div className="correction-review-list">{sorted.map((request) => { const decision = decisionByRequest.get(request.id); const employee = employeeById.get(request.employee_id); const leaveType = request.leave_type_id ? leaveTypeById.get(request.leave_type_id) : null; return <article key={request.id}><div><strong>{employee?.full_name ?? "未知員工"} · {workRequestTypeLabels[request.request_type]}{leaveType ? ` · ${leaveType.name}` : ""}</strong><span>{formatTaipeiDateTime(request.starts_at)} 至 {formatTaipeiDateTime(request.ends_at)} · {formatRequestedMinutes(request.requested_minutes)}</span><p>{request.reason}</p><small>{employee?.employee_no ?? request.employee_id.slice(0, 8)} · 申請於 {formatTaipeiDateTime(request.requested_at)}</small></div>{decision ? <div className="work-request-decision"><span className={`correction-status ${decision.decision}`}>{workRequestDecisionLabels[decision.decision]}</span>{decision.review_note ? <small>{decision.review_note}</small> : null}</div> : <form action={decideWorkRequest}><input name="requestId" type="hidden" value={request.id} /><input maxLength={500} name="reviewNote" placeholder="審核備註（選填）" /><button className="approve" name="decision" type="submit" value="approved"><Check size={14} /> 核准</button><button className="reject" name="decision" type="submit" value="rejected"><X size={14} /> 拒絕</button></form>}</article>; })}</div>}
    </section>
  </>;
}
