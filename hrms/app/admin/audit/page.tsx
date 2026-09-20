import { FileClock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { formatTaipeiDateTime } from "@/lib/schedule-display";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const actionLabels: Record<string, string> = {
  "punch.recorded": "完成打卡", "attendance.calculated": "重算出勤",
  "punch_correction.requested": "申請補卡", "punch_correction.approved": "核准補卡", "punch_correction.rejected": "拒絕補卡",
  "work_request.requested": "建立申請", "work_request.approved": "核准申請", "work_request.rejected": "拒絕申請", "work_request.withdrawn": "撤回申請",
  "employee.created": "建立員工", "employee.updated": "更新員工", "employee.account_provisioned": "建立登入帳號",
  "employee.account_status_changed": "變更帳號狀態", "employee.password_reset": "重設員工密碼", "auth.password_changed": "管理員變更自己的密碼",
  "schedule.draft_created": "建立班表草稿", "schedule.assignments_saved": "儲存班表", "schedule.published": "發布班表",
  "payroll.compensation_created": "建立薪資版本", "payroll.period_created": "建立薪資月份", "payroll.draft_calculated": "試算薪資",
  "payroll.adjustment_added": "新增薪資調整", "payroll.adjustment_removed": "移除薪資調整", "payroll.status_changed": "變更薪資狀態",
  "settings.workplace_created": "建立門市設定", "settings.payroll_created": "建立薪資週期設定",
};

function jsonSummary(value: unknown) {
  if (!value) return "—";
  const serialized = JSON.stringify(value);
  return serialized.length > 260 ? `${serialized.slice(0, 257)}…` : serialized;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const params = await searchParams;
  const admin = await getAdminContext("security.audit");
  if (!admin) redirect("/");
  const before = params.before && !Number.isNaN(Date.parse(params.before)) ? params.before : null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_audit_log_page", { p_tenant_id: admin.tenantId, p_limit: 100, p_before: before });
  const logs = data ?? [];
  const next = logs.length === 100 ? logs.at(-1)?.occurred_at : null;

  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">AUDIT TRAIL</span><h1>稽核紀錄</h1><p>查看重要操作的執行者、時間、資料類型及不可由前端竄改的資料庫紀錄。</p></div><span className="status-pill"><ShieldCheck size={15}/> 僅限稽核權限</span></header>
    {error ? <div className="admin-form-error">稽核紀錄讀取失敗，請確認權限與資料庫版本。</div> : null}
    {!error && !logs.length ? <section className="admin-panel admin-empty"><FileClock size={28}/><strong>這一頁沒有稽核紀錄</strong></section> : null}
    {logs.length ? <section className="admin-panel"><div className="admin-table-wrap"><table className="admin-table audit-table"><thead><tr><th>時間</th><th>操作</th><th>執行者</th><th>資料</th><th>變更摘要</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td><strong>{formatTaipeiDateTime(log.occurred_at)}</strong><small>#{log.id}</small></td><td>{actionLabels[log.action] ?? log.action}<small>{log.action}</small></td><td>{log.actor_email || "系統"}<small>{log.actor_user_id?.slice(0, 8) ?? "—"}</small></td><td>{log.entity_type}<small>{log.entity_id ?? "—"}</small></td><td><details><summary>查看紀錄</summary>{log.before_data ? <><b>變更前</b><code>{jsonSummary(log.before_data)}</code></> : null}{log.after_data ? <><b>變更後</b><code>{jsonSummary(log.after_data)}</code></> : null}{!log.before_data && !log.after_data ? "—" : null}</details></td></tr>)}</tbody></table></div></section> : null}
    <div className="audit-pagination">{before ? <Link className="admin-button ghost" href="/admin/audit">回到最新</Link> : null}{next ? <Link className="admin-button" href={`/admin/audit?before=${encodeURIComponent(next)}`}>更早的紀錄</Link> : null}</div>
  </>;
}
