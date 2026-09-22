import {
  Bell, CalendarDays, CheckCircle2, Clock3, Coffee, MapPin, Settings,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { PunchPanel } from "@/app/punch/punch-panel";
import { getMyPublishedSchedule } from "@/lib/my-schedule";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { getEmployeePunchContext } from "@/lib/punches";
import { formatScheduledHours, getMonthBounds, taipeiDateKey } from "@/lib/schedule-display";
import { shiftMinuteLabel } from "@/lib/schedules";
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
      }), getEmployeePunchContext({ employeeId: workspace.employeeId, tenantId: workspace.tenantId }), getUnreadNotificationCount(workspace.tenantId)])
    : [{ employeeId: null, entries: [] }, { employeeId: null, records: [], policy: { configured: false } }, 0];
  const todaySchedule = schedule.entries.find((entry) => entry.workDate === today);
  const scheduledMinutes = schedule.entries.reduce((total, entry) => total + entry.totalMinutes, 0);
  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    day: "numeric", month: "numeric", timeZone: "Asia/Taipei", weekday: "long",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit", hour12: false, minute: "2-digit", timeZone: "Asia/Taipei",
  }).format(now);
  const shortDate = `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`;

  return (
    <WorkspaceShell
      activePath="/"
      canManage={workspace.canManage}
      displayName={workspace.displayName}
      email={workspace.email}
      tenantName={workspace.tenantName}
      notificationUnreadCount={unreadNotifications}
    >
      <header className="topbar">
        <div><span className="date-label">{todayLabel}</span><h1>你好，{workspace.displayName}</h1></div>
        <div className="topbar-actions">
          {workspace.canManage ? <Link className="admin-entry" href="/admin"><Settings size={17} /> 進入管理後台</Link> : null}
          <Link className="icon-button" aria-label={`通知中心${unreadNotifications ? `，${unreadNotifications} 則未讀` : ""}`} href="/notifications"><Bell size={21} />{unreadNotifications ? <i>{Math.min(unreadNotifications, 99)}</i> : null}</Link>
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="clock-card">
          <div className="clock-copy">
            <span className="status-pill"><span /> 已同步發布班表</span>
            <p className="time">{timeLabel}</p>
            <p className="shift-note">{todaySchedule ? `今日班別：${todaySchedule.shiftName}` : "今日沒有已發布的排班"}</p>
            <PunchPanel enabled={Boolean(punches.employeeId)} lastEventType={punches.records[0]?.event_type ?? null}
              scheduledPunchCount={todaySchedule ? punches.records.filter((record) => record.work_date === today).length : null}
              hasLunchBreak={todaySchedule?.shiftCode === "WEEKDAY_SPLIT" && todaySchedule.segments.length === 2} />
          </div>
          <div className="location-orbit" aria-hidden="true">
            <div className="orbit outer" /><div className="orbit inner" />
            <div className="pin"><MapPin size={25} /></div>
            <span className="location-label">{punches.policy.configured
              ? `${punches.policy.name ?? "門市"} · ${punches.policy.mode === "enforced" ? `範圍 ${punches.policy.radius_m ?? "—"}m` : "記錄定位"}`
              : "店址圍欄尚未設定"}</span>
          </div>
        </section>

        <section className="summary-card">
          <div className="section-heading"><div><span className="eyebrow">本月摘要</span><h2>排班狀況</h2></div></div>
          <div className="stat-grid">
            <article><span className="stat-icon mint"><Clock3 size={20} /></span><strong>{formatScheduledHours(scheduledMinutes)}</strong><small>已發布排班時數</small></article>
            <article><span className="stat-icon sand"><Coffee size={20} /></span><strong><Link href="/requests">申請</Link></strong><small>請假與加班中心</small></article>
            <article><span className="stat-icon blue"><CheckCircle2 size={20} /></span><strong><Link href="/attendance">查看</Link></strong><small>每日出勤與原始打卡</small></article>
          </div>
        </section>

        <section className="schedule-card">
          <div className="section-heading"><div><span className="eyebrow">TODAY</span><h2>今日班表</h2></div><span className="date-chip"><CalendarDays size={16} /> {shortDate}</span></div>
          {todaySchedule?.segments.length ? (
            <div className="timeline">
              {todaySchedule.segments.map((segment, index) => (
                <article className="timeline-row" key={segment.order}>
                  <time>{shiftMinuteLabel(segment.startMinute)}</time>
                  <div className={index === 0 ? "timeline-dot current" : "timeline-dot"} />
                  <div className="schedule-detail"><div><strong>{todaySchedule.shiftName} · 第 {segment.order} 段</strong><span>{shiftMinuteLabel(segment.startMinute)}–{shiftMinuteLabel(segment.endMinute)}</span></div><em>已發布</em></div>
                </article>
              ))}
            </div>
          ) : (
            <div className="dashboard-empty"><CalendarDays size={24} /><strong>{schedule.employeeId ? "今日未排班" : "尚未連結員工資料"}</strong><p>{schedule.employeeId ? "這表示目前沒有已發布排班，不代表已核准休假。" : "請由管理員在員工資料中建立或連結登入帳號。"}</p></div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
