import { Clock3, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { locationVerificationLabels, punchEventLabels, punchSourceLabels } from "@/lib/punch-contract";
import { getEmployeePunchContext } from "@/lib/punches";
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

  return (
    <WorkspaceShell activePath="/attendance" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
      <header className="my-schedule-header"><div><span className="date-label">ATTENDANCE EVIDENCE</span><h1>出勤紀錄</h1><p>正式時間採用伺服器時間；原始紀錄建立後不可修改或刪除。</p></div></header>
      {!result.employeeId ? (
        <section className="my-schedule-empty"><Clock3 size={30} /><strong>此帳號尚未連結在職員工資料</strong><p>請聯絡管理員建立或連結員工登入帳號。</p></section>
      ) : result.records.length === 0 ? (
        <section className="my-schedule-empty"><Clock3 size={30} /><strong>尚無打卡紀錄</strong><p>回到工作台，同意使用定位後即可進行第一次上班打卡。</p></section>
      ) : (
        <section className="attendance-list" aria-label="個人打卡紀錄">
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
