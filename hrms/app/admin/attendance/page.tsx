import { Clock3, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { locationVerificationLabels, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

export default async function AdminAttendancePage() {
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

  return (
    <>
      <header className="admin-page-header"><div><span className="admin-eyebrow">ATTENDANCE</span><h1>原始打卡紀錄</h1><p>只讀、不可變更；每筆時間與 GPS 證據由伺服器留存。</p></div></header>
      <section className="admin-panel">
        {error || employeesResult.error ? <div className="admin-empty"><strong>打卡紀錄讀取失敗</strong><p>請確認最新 database migration 已完成。</p></div> : !records?.length ? <div className="admin-empty"><Clock3 size={30} /><strong>尚無打卡紀錄</strong><p>員工完成 GPS 打卡後會顯示在這裡。</p></div> : (
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>伺服器時間</th><th>員工</th><th>事件</th><th>工作日</th><th>來源</th><th>定位證據</th><th>驗證</th></tr></thead><tbody>
            {records.map((record) => { const employee = employees.get(record.employee_id); return <tr key={record.id}><td><strong>{timeLabel(record.occurred_at)}</strong></td><td>{employee?.full_name ?? "未知員工"}<br /><code>{employee?.employee_no ?? record.employee_id.slice(0, 8)}</code></td><td><span className={`attendance-event ${record.event_type}`}>{punchEventLabels[record.event_type]}</span></td><td>{record.work_date}</td><td>{punchSourceLabels[record.source]}</td><td><MapPin size={13} /> {Number(record.latitude).toFixed(5)}, {Number(record.longitude).toFixed(5)}<br /><small>誤差約 {Number(record.accuracy_m).toFixed(0)} m</small></td><td>{locationVerificationLabels[record.location_verification]}</td></tr>; })}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}
