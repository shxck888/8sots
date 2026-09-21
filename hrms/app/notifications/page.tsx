import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export const dynamic = "force-dynamic";

const kindLabels: Record<string, string> = {
  request: "申請", attendance: "出勤", schedule: "班表", payroll: "薪資", system: "系統",
};

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

export default async function NotificationsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getWorkspaceContext();
  if (!workspace?.tenantId) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("notifications").select("*")
    .eq("tenant_id", workspace.tenantId).order("created_at", { ascending: false }).limit(100);
  const notifications = data ?? [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  return <WorkspaceShell activePath="/notifications" canManage={workspace.canManage}
    displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}
    notificationUnreadCount={unreadCount}>
    <header className="topbar notifications-header"><div><span className="date-label">NOTIFICATION CENTER</span><h1>通知中心</h1><p>申請審核、補打卡、班表與薪資發布都會集中在這裡。</p></div>
      {unreadCount ? <form action={markAllNotificationsRead}><button className="admin-entry"><CheckCheck size={17}/> 全部標為已讀</button></form> : null}
    </header>
    {params.saved ? <div className="admin-success">通知已全部標為已讀。</div> : null}
    {params.error || error ? <div className="admin-form-error">通知更新失敗，請稍後再試。</div> : null}
    {!notifications.length ? <section className="notification-empty"><Bell size={30}/><strong>目前沒有通知</strong><p>新的申請結果、班表與薪資單發布後會顯示在這裡。</p></section> :
      <section className="notification-list" aria-label="通知列表">{notifications.map((item) => <article className={item.read_at ? "read" : "unread"} key={item.id}>
        <div className="notification-icon"><Bell size={18}/></div><div className="notification-copy"><div><span>{kindLabels[item.kind] ?? "通知"}</span><time dateTime={item.created_at}>{dateTimeLabel(item.created_at)}</time></div><h2>{item.title}</h2><p>{item.body}</p><Link href={item.href}>查看內容 <ExternalLink size={14}/></Link></div>
        {!item.read_at ? <form action={markNotificationRead}><input type="hidden" name="notificationId" value={item.id}/><button aria-label={`將「${item.title}」標為已讀`} title="標為已讀"><Check size={17}/></button></form> : <span className="notification-read-label">已讀</span>}
      </article>)}</section>}
  </WorkspaceShell>;
}
