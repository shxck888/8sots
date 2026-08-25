import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getMyPublishedSchedule } from "@/lib/my-schedule";
import { formatScheduledHours, taipeiDateKey } from "@/lib/schedule-display";
import { buildWeekDates, getWeekStart, shiftMinuteLabel, toIsoDate } from "@/lib/schedules";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function dayLabel(dateKey: string): { date: string; weekday: string } {
  const value = new Date(`${dateKey}T12:00:00.000Z`);
  return {
    date: new Intl.DateTimeFormat("zh-TW", { day: "numeric", month: "numeric", timeZone: "UTC" }).format(value),
    weekday: new Intl.DateTimeFormat("zh-TW", { timeZone: "UTC", weekday: "short" }).format(value),
  };
}

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const params = await searchParams;
  const weekStart = getWeekStart(params.week, new Date(`${taipeiDateKey()}T12:00:00.000Z`));
  const dates = buildWeekDates(weekStart);
  const result = workspace.tenantId
    ? await getMyPublishedSchedule({
        dateFrom: dates[0],
        dateTo: dates[6],
        tenantId: workspace.tenantId,
        userId: workspace.userId,
      })
    : { employeeId: null, entries: [] };
  const entryByDate = new Map(result.entries.map((entry) => [entry.workDate, entry]));
  const weekMinutes = result.entries.reduce((total, entry) => total + entry.totalMinutes, 0);

  return (
    <WorkspaceShell
      activePath="/my-schedule"
      canManage={workspace.canManage}
      displayName={workspace.displayName}
      email={workspace.email}
      tenantName={workspace.tenantName}
    >
      <header className="my-schedule-header">
        <div><span className="date-label">EMPLOYEE SCHEDULE</span><h1>我的班表</h1><p>僅顯示已發布排班；未排班不等於已核准休假。</p></div>
        <nav className="my-week-nav" aria-label="切換週次">
          <Link aria-label="上一週" href={`/my-schedule?week=${addDays(weekStart, -7)}`}><ChevronLeft size={18} /></Link>
          <strong>{dayLabel(weekStart).date}－{dayLabel(dates[6]).date}</strong>
          <Link aria-label="下一週" href={`/my-schedule?week=${addDays(weekStart, 7)}`}><ChevronRight size={18} /></Link>
        </nav>
      </header>

      {!result.employeeId ? (
        <section className="my-schedule-empty"><CalendarDays size={30} /><strong>此帳號尚未連結員工資料</strong><p>請聯絡管理員至員工管理頁建立或連結登入帳號。</p></section>
      ) : (
        <>
          <section className="my-schedule-summary"><div><span className="stat-icon mint"><Clock3 size={20} /></span><div><small>本週已發布</small><strong>{formatScheduledHours(weekMinutes)} 小時</strong></div></div><p>共 {result.entries.length} 個排班日</p></section>
          <section className="my-schedule-grid">
            {dates.map((dateKey) => {
              const label = dayLabel(dateKey);
              const entry = entryByDate.get(dateKey);
              const isToday = dateKey === taipeiDateKey();
              return (
                <article className={isToday ? "my-day-card today" : "my-day-card"} key={dateKey}>
                  <header><div><span>{label.weekday}</span><strong>{label.date}</strong></div>{isToday ? <em>今天</em> : null}</header>
                  {entry ? (
                    <div className="my-shift"><span className="schedule-status published">已發布</span><h2>{entry.shiftName}</h2><small>{entry.shiftCode}</small><div className="my-segments">{entry.segments.map((segment) => <p key={segment.order}><Clock3 size={15} /><span>{shiftMinuteLabel(segment.startMinute)}–{shiftMinuteLabel(segment.endMinute)}</span></p>)}</div><strong className="my-total">共 {formatScheduledHours(entry.totalMinutes)} 小時</strong></div>
                  ) : (
                    <div className="my-day-empty"><CalendarDays size={20} /><strong>未排班</strong><span>目前沒有已發布班別</span></div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
