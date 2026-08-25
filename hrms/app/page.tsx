import {
  Bell, CalendarDays, CheckCircle2, Clock3, Coffee, MapPin, QrCode, UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getMyPublishedSchedule } from "@/lib/my-schedule";
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
  const schedule = workspace.tenantId
    ? await getMyPublishedSchedule({
        ...getMonthBounds(today),
        tenantId: workspace.tenantId,
        userId: workspace.userId,
      })
    : { employeeId: null, entries: [] };
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
    >
      <header className="topbar">
        <div><span className="date-label">{todayLabel}</span><h1>你好，{workspace.displayName}</h1></div>
        <button className="icon-button" aria-label="通知功能尚未上線" disabled><Bell size={21} /></button>
      </header>

      <div className="dashboard-grid">
        <section className="clock-card">
          <div className="clock-copy">
            <span className="status-pill"><span /> 已同步發布班表</span>
            <p className="time">{timeLabel}</p>
            <p className="shift-note">{todaySchedule ? `今日班別：${todaySchedule.shiftName}` : "今日沒有已發布的排班"}</p>
            <button className="clock-button" disabled><Clock3 size={22} /> 打卡功能建構中</button>
            <button className="qr-button" disabled><QrCode size={18} /> QR Code 尚未啟用</button>
          </div>
          <div className="location-orbit" aria-hidden="true">
            <div className="orbit outer" /><div className="orbit inner" />
            <div className="pin"><MapPin size={25} /></div>
            <span className="location-label">定位服務尚未啟用</span>
          </div>
        </section>

        <section className="summary-card">
          <div className="section-heading"><div><span className="eyebrow">本月摘要</span><h2>排班狀況</h2></div></div>
          <div className="stat-grid">
            <article><span className="stat-icon mint"><Clock3 size={20} /></span><strong>{formatScheduledHours(scheduledMinutes)}</strong><small>已發布排班時數</small></article>
            <article><span className="stat-icon sand"><Coffee size={20} /></span><strong>—</strong><small>休假功能尚未上線</small></article>
            <article><span className="stat-icon blue"><CheckCircle2 size={20} /></span><strong>—</strong><small>出勤統計尚未上線</small></article>
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

        <section className="team-card">
          <div className="section-heading"><div><span className="eyebrow">SYSTEM</span><h2>功能進度</h2></div><span className="team-count"><UsersRound size={16} /> 員工端</span></div>
          <div className="notice"><div className="notice-icon">班</div><div><strong>我的班表已連線</strong><p>只顯示管理員已發布的個人排班；草稿不會提前曝光。</p></div></div>
          <div className="feature-status"><span><i className="online" /> 登入與個人班表</span><span><i /> 打卡、出勤與申請中心建構中</span></div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
