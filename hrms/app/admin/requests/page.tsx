import { Check, ClipboardCheck, Download, Paperclip, X } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { formatTaipeiDateTime } from "@/lib/schedule-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatRequestedMinutes, workRequestDecisionLabels, workRequestTypeLabels } from "@/lib/work-request-contract";
import { decideWorkRequest, saveLeaveEntitlement } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRequestsPage({ searchParams }: {
  searchParams: Promise<{ decided?: string; entitlementSaved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext("request.manage");
  if (!admin) redirect("/");
  const supabase = await createSupabaseServerClient();
  const { data: requests, error } = await supabase.from("work_requests").select("*").eq("tenant_id", admin.tenantId).order("requested_at", { ascending: false }).limit(100);
  const requestIds = (requests ?? []).map((item) => item.id);
  const [{ data: decisions }, { data: withdrawals }, { data: employees }, { data: leaveTypes }, { data: attachments }] = await Promise.all([
    requestIds.length ? supabase.from("work_request_decisions").select("*").in("work_request_id", requestIds) : Promise.resolve({ data: [] }),
    requestIds.length ? supabase.from("work_request_withdrawals").select("*").in("work_request_id", requestIds) : Promise.resolve({ data: [] }),
    supabase.from("employees").select("id, employee_no, full_name").eq("tenant_id", admin.tenantId).eq("status", "active").order("employee_no"),
    supabase.from("leave_types").select("*").eq("tenant_id", admin.tenantId).eq("is_active", true).order("code"),
    requestIds.length ? supabase.from("work_request_attachments").select("id, work_request_id, object_path, file_name").in("work_request_id", requestIds) : Promise.resolve({ data: [] }),
  ]);
  const attachmentList = attachments ?? [];
  const signedByPath = new Map<string, string>();
  if (attachmentList.length) {
    const { data: signed } = await supabase.storage.from("work-request-proofs")
      .createSignedUrls(attachmentList.map((item) => item.object_path), 120);
    for (const entry of signed ?? []) {
      if (entry.signedUrl && entry.path) signedByPath.set(entry.path, entry.signedUrl);
    }
  }
  const attachmentsByRequest = new Map<string, { id: string; file_name: string; url: string | undefined }[]>();
  for (const attachment of attachmentList) {
    const list = attachmentsByRequest.get(attachment.work_request_id) ?? [];
    list.push({ id: attachment.id, file_name: attachment.file_name, url: signedByPath.get(attachment.object_path) });
    attachmentsByRequest.set(attachment.work_request_id, list);
  }
  const decisionByRequest = new Map((decisions ?? []).map((item) => [item.work_request_id, item]));
  const employeeById = new Map((employees ?? []).map((item) => [item.id, item]));
  const leaveTypeById = new Map((leaveTypes ?? []).map((item) => [item.id, item]));
  const withdrawnIds = new Set((withdrawals ?? []).map((item) => item.work_request_id));
  const sorted = [...(requests ?? [])].sort((a, b) => Number(Boolean(decisionByRequest.get(a.id) || withdrawnIds.has(a.id))) - Number(Boolean(decisionByRequest.get(b.id) || withdrawnIds.has(b.id))));

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">APPROVALS</span><h1>申請審核</h1><p>審核員工請假與加班；原始申請與決定均保留稽核紀錄。</p></div></header>
    {params.decided ? <div className="admin-success">申請已完成審核。</div> : null}
    {params.entitlementSaved ? <div className="admin-success">假別額度已儲存。</div> : null}
    {params.error ? <div className="admin-form-error">{params.error === "proofRequired" ? "此假別需要附件證明，上傳證明後才能核准。" : "審核失敗，申請可能已被其他管理員處理。"}</div> : null}
    <section className="admin-panel entitlement-panel"><header><div><span className="admin-eyebrow">LEAVE BALANCE</span><h2>年度假別額度</h2></div></header><form action={saveLeaveEntitlement}><select name="employeeId" required defaultValue=""><option disabled value="">選擇員工</option>{employees?.map((e) => <option key={e.id} value={e.id}>{e.employee_no} · {e.full_name}</option>)}</select><select name="leaveTypeId" required defaultValue=""><option disabled value="">選擇假別</option>{leaveTypes?.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}</select><input name="entitlementYear" type="number" min="2000" max="2200" defaultValue={new Date().getFullYear()} required /><input name="entitledHours" type="number" min="0" max="8784" step="0.5" placeholder="額度（小時）" required /><input name="note" maxLength={200} placeholder="備註（選填）" /><button className="admin-button" type="submit">儲存額度</button></form><p className="request-policy-note">額度以分鐘保存；已核准請假才計入使用量，系統不由此推導扣薪。</p></section>
    <section className="admin-panel correction-review work-request-review"><header><div><span className="admin-eyebrow">REQUEST QUEUE</span><h2>請假與加班</h2></div><small>{sorted.filter((item) => !decisionByRequest.has(item.id) && !withdrawnIds.has(item.id)).length} 筆待審</small></header>
      {error ? <div className="admin-empty"><strong>申請資料讀取失敗</strong><p>請確認最新 database migration 已完成。</p></div> : !sorted.length ? <div className="admin-empty"><ClipboardCheck size={28} /><strong>目前沒有申請</strong></div> : <div className="correction-review-list">{sorted.map((request) => { const decision = decisionByRequest.get(request.id); const withdrawn = withdrawnIds.has(request.id); const employee = employeeById.get(request.employee_id); const leaveType = request.leave_type_id ? leaveTypeById.get(request.leave_type_id) : null; const attachments = attachmentsByRequest.get(request.id) ?? []; const proofMissing = Boolean(leaveType?.requires_proof && attachments.length === 0); return <article key={request.id}><div><strong>{employee?.full_name ?? "未知員工"} · {workRequestTypeLabels[request.request_type]}{leaveType ? ` · ${leaveType.name}` : ""}</strong><span>{formatTaipeiDateTime(request.starts_at)} 至 {formatTaipeiDateTime(request.ends_at)} · {formatRequestedMinutes(request.requested_minutes)}</span><p>{request.reason}</p><small>{employee?.employee_no ?? request.employee_id.slice(0, 8)} · 申請於 {formatTaipeiDateTime(request.requested_at)}</small>{attachments.length ? <div className="request-proof-links"><Paperclip size={13} />{attachments.map((attachment) => attachment.url ? <a key={attachment.id} href={attachment.url} rel="noopener noreferrer" target="_blank"><Download size={12} /> {attachment.file_name}</a> : <span key={attachment.id}>{attachment.file_name}</span>)}</div> : proofMissing ? <p className="request-policy-note">此假別需要附件證明，尚不可核准。</p> : null}</div>{withdrawn ? <div className="work-request-decision"><span className="correction-status withdrawn">已撤回</span></div> : decision ? <div className="work-request-decision"><span className={`correction-status ${decision.decision}`}>{workRequestDecisionLabels[decision.decision]}</span>{decision.review_note ? <small>{decision.review_note}</small> : null}</div> : <form action={decideWorkRequest}><input name="requestId" type="hidden" value={request.id} /><input maxLength={500} name="reviewNote" placeholder="審核備註（選填）" /><button className="approve" disabled={proofMissing} name="decision" title={proofMissing ? "需先上傳附件證明" : undefined} type="submit" value="approved"><Check size={14} /> {proofMissing ? "待補證明" : "核准"}</button><button className="reject" name="decision" type="submit" value="rejected"><X size={14} /> 拒絕</button></form>}</article>; })}</div>}
    </section>
  </>;
}
