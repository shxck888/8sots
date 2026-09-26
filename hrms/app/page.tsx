import {
  Bell, CheckCircle2, Clock3, Coffee, Settings,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { LiveClock } from "@/app/live-clock";
import { PunchPanel } from "@/app/punch/punch-panel";
import { getMyPublishedSchedule } from "@/lib/my-schedule";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { getEmployeePunchContext } from "@/lib/punches";
import { formatScheduledHours, getMonthBounds, taipeiDateKey } from "@/lib/schedule-display";
import { TodayScheduleCard } from "@/app/today-schedule-card";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  let workspace;
  try {
    workspace = await getWorkspaceContext();
  } catch {
    redirect("/login");
  }
  if (!workspace) redirect("/login");

  const now = new Date();
  const today = taipeiDateKey(now);
  const [schedule, punches, unreadNotifications] = workspace.tenantId
      ? await Promise.all([getMyPublishedSchedule({
        ...getMonthBounds(today),
        employeeId: workspace.employeeId,
      }), getEmployeePunchContext({ limit: 200, employeeId: workspace.employeeId, tenantId: workspace.tenantId }), getUnreadNotificationCount(workspace.tenantId)])
    : [{ employeeId: null, entries: [], daysOff: [], storeClosed: [] }, { employeeId: null, records: [], policy: { configured: false } }, 0];
  const todaySchedule = schedule.entries.find((entry) => entry.workDate === today);
  const scheduledMinutes = schedule.entries.reduce((total, entry) => total + entry.totalMinutes, 0);
  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    day: "numeric", month: "numeric", timeZone: "Asia/Taipei", weekday: "long",
  }).format(now);
  const todayOff = schedule.storeClosed.includes(today) ? "例假（店休）" : schedule.daysOff.includes(today) ? "休息日（休假）" : null;

  return (
    <WorkspaceShell
      activePath="/"
      canManage={workspace.canManage}
      displayName={workspace.displayName}
      email={workspace.email}
      tenantName={workspace.tenantName}
      notificationUnreadCount={unreadNotifications}
    >
      <div className="employee-home">
      <header className="topbar">
        <div><h1>你好，{workspace.displayName}</h1><span className="date-label">{todayLabel}</span></div>
        <div className="topbar-actions">
          {workspace.canManage ? <Link className="admin-entry" href="/admin"><Settings size={17} /> 進入管理後台</Link> : null}
          <Link className="icon-button" aria-label={`通知中心${unreadNotifications ? `，${unreadNotifications} 則未讀` : ""}`} href="/notifications"><Bell size={21} />{unreadNotifications ? <i>{Math.min(unreadNotifications, 99)}</i> : null}</Link>
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="clock-card">
          <div className="clock-copy">
            <LiveClock initialTimestamp={now.toISOString()} />
            <p className="shift-note">{todaySchedule ? `今日班別：${todaySchedule.shiftName}` : todayOff ?? "今日沒有已發布的排班"}</p>
          </div>
        </section>

        <PunchPanel key={`${today}:${punches.records.map(record => record.id).join(",")}`} enabled={Boolean(punches.employeeId)}
          records={punches.records.filter((record) => record.work_date === today)}
          initialTimestamp={now.toISOString()} workDate={today}
          hasLunchBreak={todaySchedule?.shiftCode === "WEEKDAY_SPLIT" && todaySchedule.segments.length === 2}>
          <TodayScheduleCard entry={todaySchedule} workDate={today} linked={Boolean(schedule.employeeId)} dayOff={todayOff} />
        </PunchPanel>

        <details className="summary-card home-month-summary">
          <summary>本月摘要</summary>
          <div className="stat-grid">
            <article><span className="stat-icon mint"><Clock3 size={20} /></span><strong>{formatScheduledHours(scheduledMinutes)}</strong><small>已發布排班時數</small></article>
            <article><span className="stat-icon sand"><Coffee size={20} /></span><strong><Link href="/requests">申請</Link></strong><small>請假與加班中心</small></article>
            <article><span className="stat-icon blue"><CheckCircle2 size={20} /></span><strong><Link href="/attendance">查看</Link></strong><small>每日出勤與原始打卡</small></article>
          </div>
        </details>
      </div>
      </div>
    </WorkspaceShell>
  );
}
