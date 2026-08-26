import { ClipboardList, Paperclip } from "lucide-react";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { formatTaipeiDateTime } from "@/lib/schedule-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { calculateLeaveBalance, formatRequestedMinutes, workRequestDecisionLabels, workRequestTypeLabels } from "@/lib/work-request-contract";
import { RequestForm } from "./request-form";
import { ProofUploader } from "./proof-uploader";
import { withdrawWorkRequest } from "./actions";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const [{ data: leaveTypes }, { data: requests }, { data: entitlements }] = workspace.employeeId && workspace.tenantId
    ? await Promise.all([
      supabase.from("leave_types").select("*").eq("tenant_id", workspace.tenantId).eq("is_active", true).order("code"),
      supabase.from("work_requests").select("*").eq("tenant_id", workspace.tenantId).eq("employee_id", workspace.employeeId).order("requested_at", { ascending: false }).limit(50),
      supabase.from("leave_entitlements").select("*").eq("tenant_id", workspace.tenantId).eq("employee_id", workspace.employeeId).eq("entitlement_year", new Date().getFullYear()),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const requestIds = (requests ?? []).map((item) => item.id);
  const [{ data: decisions }, { data: withdrawals }, { data: attachments }] = requestIds.length ? await Promise.all([
    supabase.from("work_request_decisions").select("*").in("work_request_id", requestIds),
    supabase.from("work_request_withdrawals").select("*").in("work_request_id", requestIds),
    supabase.from("work_request_attachments").select("id, work_request_id, file_name").in("work_request_id", requestIds),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const decisionByRequest = new Map((decisions ?? []).map((item) => [item.work_request_id, item]));
  const attachmentsByRequest = new Map<string, { id: string; file_name: string }[]>();
  for (const attachment of attachments ?? []) {
    const list = attachmentsByRequest.get(attachment.work_request_id) ?? [];
    list.push({ id: attachment.id, file_name: attachment.file_name });
    attachmentsByRequest.set(attachment.work_request_id, list);
  }
  const leaveTypeById = new Map((leaveTypes ?? []).map((item) => [item.id, item]));
  const withdrawnIds = new Set((withdrawals ?? []).map((item) => item.work_request_id));
  const usedByType = new Map<string, number>();
  for (const request of requests ?? []) if (request.request_type === "leave" && request.leave_type_id && !withdrawnIds.has(request.id) && decisionByRequest.get(request.id)?.decision === "approved" && new Date(request.starts_at).getFullYear() === new Date().getFullYear()) usedByType.set(request.leave_type_id, (usedByType.get(request.leave_type_id) ?? 0) + request.requested_minutes);

  return (
    <WorkspaceShell activePath="/requests" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
      <header className="my-schedule-header"><div><span className="date-label">REQUEST CENTER</span><h1>申請中心</h1><p>提出請假或加班申請，審核結果與原始內容都會保留。</p></div></header>
      {!workspace.employeeId ? <section className="my-schedule-empty"><ClipboardList size={30} /><strong>此帳號尚未連結在職員工資料</strong><p>請聯絡管理員完成員工登入帳號連結後再提出申請。</p></section> : <>
        <section className="work-request-form-grid">
          <RequestForm enabled leaveTypes={leaveTypes ?? []} requestType="leave" />
          <RequestForm enabled leaveTypes={leaveTypes ?? []} requestType="overtime" />
        </section>
        <section className="leave-balance-grid" aria-label="本年度假別額度">
          {(entitlements ?? []).map((item) => { const leaveType = leaveTypeById.get(item.leave_type_id); const balance = calculateLeaveBalance(item.entitled_minutes, usedByType.get(item.leave_type_id) ?? 0); return <article key={item.id}><span>{item.entitlement_year} · {leaveType?.name ?? "假別"}</span><strong>{formatRequestedMinutes(balance.remainingMinutes)}</strong><small>額度 {formatRequestedMinutes(balance.entitledMinutes)} · 已核准 {formatRequestedMinutes(balance.usedMinutes)}</small></article>; })}
          {!entitlements?.length ? <p className="request-policy-note">尚未設定本年度假別額度；請假仍可送審，但不代表可用餘額或薪資結果。</p> : null}
        </section>
        <section className="attendance-summary-list work-request-history"><header><div><span className="eyebrow">MY REQUESTS</span><h2>我的申請紀錄</h2></div><small>最近 50 筆</small></header>
          {!requests?.length ? <div className="admin-empty"><ClipboardList size={28} /><strong>目前沒有申請紀錄</strong><p>送出第一筆請假或加班申請後會顯示在這裡。</p></div> : requests.map((request) => { const decision = decisionByRequest.get(request.id); const withdrawn = withdrawnIds.has(request.id); const leaveType = request.leave_type_id ? leaveTypeById.get(request.leave_type_id) : null; return <article key={request.id}>
            <strong>{workRequestTypeLabels[request.request_type]}{leaveType ? ` · ${leaveType.name}` : ""}</strong>
            <span>{formatTaipeiDateTime(request.starts_at)}<br />至 {formatTaipeiDateTime(request.ends_at)}</span>
            <span>{formatRequestedMinutes(request.requested_minutes)}</span>
            <span className={`correction-status ${withdrawn ? "withdrawn" : decision?.decision ?? "pending"}`}>{withdrawn ? "已撤回" : decision ? workRequestDecisionLabels[decision.decision] : "待審核"}</span>
            <em title={request.reason}>{request.reason}{decision?.review_note ? `｜審核：${decision.review_note}` : ""}{!decision && !withdrawn ? <form action={withdrawWorkRequest}><input name="requestId" type="hidden" value={request.id} /><button className="text-button" type="submit">撤回申請</button></form> : null}</em>
            {!decision && !withdrawn
              ? <ProofUploader attachments={attachmentsByRequest.get(request.id) ?? []} requestId={request.id} />
              : (attachmentsByRequest.get(request.id)?.length
                ? <ul className="proof-list proof-list-readonly">{attachmentsByRequest.get(request.id)!.map((attachment) => <li key={attachment.id}><Paperclip size={13} /> {attachment.file_name}</li>)}</ul>
                : null)}
          </article>; })}
        </section>
      </>}
    </WorkspaceShell>
  );
}
