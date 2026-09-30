import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/app/workspace-shell";
import { getMyPublishedSchedule, type MyScheduleEntry } from "@/lib/my-schedule";
import { formatScheduledHours, getMonthBounds, getMonthCalendarDates, scheduledWorkMinutes, shiftCalendarMonth, taipeiDateKey } from "@/lib/schedule-display";
import { buildWeekDates, getWeekStart, HOLIDAY_SHIFT_CODE, isLunchShiftCode, OCTOBER_WEEKDAY_SHIFT_CODE, shiftMinuteLabel, toIsoDate } from "@/lib/schedules";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function dateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00.000Z`));
}

function shiftTone(entry: MyScheduleEntry): string {
  if (entry.segments.length > 1) return "split";
  return (entry.segments[0]?.startMinute ?? 0) >= 14 * 60 ? "late" : "early";
}

function ShiftDetail({ entry, dayOff = false, storeClosed = false, compact = false }: { entry?: MyScheduleEntry; dayOff?: boolean; storeClosed?: boolean; compact?: boolean }) {
  if (storeClosed) return <div className="my-selected-day-off"><span className="my-shift-badge closed">店休</span>{compact ? null : <p>這天已在班表中指定為店休，沒有上班班次。</p>}</div>;
  if (dayOff) return <div className="my-selected-day-off"><span className="my-shift-badge off">休假</span>{compact ? null : <p>這天已在班表中指定為休假（排休）。請假申請與核准紀錄請至請假中心查看。</p>}</div>;
  if (!entry) return <p className="my-selected-empty">{compact ? "未排班" : "這天目前沒有已發布班別。未排班不代表已核准休假。"}</p>;
  return (
    <div className="my-selected-shift">
      <div className="my-selected-shift-heading"><span className={`my-shift-badge ${shiftTone(entry)}`}>{entry.shiftName}</span><strong>預定工作 {formatScheduledHours(scheduledWorkMinutes(entry.shiftCode, entry.totalMinutes))} 小時</strong></div>
      <div className="my-selected-segments">
        {entry.segments.map((segment) => <span key={segment.order}><Clock3 size={17} />{shiftMinuteLabel(segment.startMinute)}–{shiftMinuteLabel(segment.endMinute)}</span>)}
      </div>
      {isLunchShiftCode(entry.shiftCode) && entry.segments.length === 2 ? <div className="my-selected-shift-notes"><p>午休 {shiftMinuteLabel(entry.segments[0].endMinute)}–{shiftMinuteLabel(entry.segments[1].startMinute)}，需打開始及結束午休卡。</p>{entry.shiftCode === OCTOBER_WEEKDAY_SHIFT_CODE ? <><p>午休結束後自動吃飯 16:30–17:00，17:00 開始工作；</p><p>上午另有 30 分鐘吃飯休息。</p></> : null}</div> : null}
      {entry.shiftCode === HOLIDAY_SHIFT_CODE ? <div className="my-selected-shift-notes"><p>上午、下午各有一段 30 分鐘吃飯休息；</p><p>休息開始時需打卡，實際工時依打卡與休息紀錄計算。</p></div> : null}
    </div>
  );
}

export default async function MySchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string; week?: string; day?: string }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const params = await searchParams;
  const today = taipeiDateKey();
  const isWeek = params.view === "week" || (typeof params.week === "string" && params.view !== "month" && !params.month);
  const weekStart = getWeekStart(typeof params.week === "string" ? params.week : undefined, new Date(`${today}T12:00:00.000Z`));
  const monthKey = typeof params.month === "string" && /^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(params.month) ? params.month : isWeek ? weekStart.slice(0, 7) : today.slice(0, 7);
  const dates = isWeek ? buildWeekDates(weekStart) : getMonthCalendarDates(monthKey);
  const bounds = getMonthBounds(`${monthKey}-01`);
  const dateFrom = isWeek ? dates[0] : bounds.dateFrom;
  const dateTo = isWeek ? dates[6] : bounds.dateTo;
  const result = workspace.tenantId
    ? await getMyPublishedSchedule({ dateFrom, dateTo, employeeId: workspace.employeeId })
    : { employeeId: null, entries: [], daysOff: [], storeClosed: [] };
  const entryByDate = new Map(result.entries.map((entry) => [entry.workDate, entry]));
  const daysOff = new Set(result.daysOff);
  const storeClosed = new Set(result.storeClosed);
  const totalMinutes = result.entries.reduce((total, entry) => total + scheduledWorkMinutes(entry.shiftCode, entry.totalMinutes), 0);
  const selectedDay = !isWeek && typeof params.day === "string" && params.day.startsWith(`${monthKey}-`) && params.day >= bounds.dateFrom && params.day <= bounds.dateTo
    ? params.day
    : monthKey === today.slice(0, 7) ? today : result.entries[0]?.workDate ?? result.daysOff[0] ?? result.storeClosed[0] ?? bounds.dateFrom;
  const monthLabel = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${monthKey}-01T12:00:00.000Z`));

  return (
    <WorkspaceShell activePath="/my-schedule" canManage={workspace.canManage} displayName={workspace.displayName} email={workspace.email} tenantName={workspace.tenantName}>
      <header className="my-schedule-header">
        <div><h1>我的班表</h1><p>查看已發布班次、店休與休假。未排班表示尚未指定安排。</p></div>
        <nav className="my-view-switch" aria-label="班表顯示方式">
          <Link className={!isWeek ? "active" : ""} aria-current={!isWeek ? "page" : undefined} href={`/my-schedule?month=${monthKey}`}>月曆</Link>
          <Link className={isWeek ? "active" : ""} aria-current={isWeek ? "page" : undefined} href={`/my-schedule?view=week&week=${isWeek ? weekStart : getWeekStart(selectedDay)}`}>週檢視</Link>
        </nav>
      </header>

      {!result.employeeId ? (
        <section className="my-schedule-empty"><CalendarDays size={30} /><strong>此帳號尚未連結員工資料</strong><p>請聯絡管理員至員工管理頁建立或連結登入帳號。</p></section>
      ) : (
        <>
          <section className="my-schedule-panel">
            <div className="my-schedule-toolbar">
              <div><span className="eyebrow">已發布班表</span><h2>{isWeek ? `${dateLabel(dates[0])}－${dateLabel(dates[6])}` : monthLabel}</h2></div>
              <nav className="my-period-nav" aria-label={isWeek ? "切換週次" : "切換月份"}>
                <Link aria-label={isWeek ? "上一週" : "上個月"} href={isWeek ? `/my-schedule?view=week&week=${addDays(weekStart, -7)}` : `/my-schedule?month=${shiftCalendarMonth(monthKey, -1)}`}><ChevronLeft size={20} /></Link>
                <Link className="my-today-link" href={isWeek ? `/my-schedule?view=week&week=${getWeekStart(undefined, new Date(`${today}T12:00:00.000Z`))}` : `/my-schedule?month=${today.slice(0, 7)}&day=${today}`}>今天</Link>
                <Link aria-label={isWeek ? "下一週" : "下個月"} href={isWeek ? `/my-schedule?view=week&week=${addDays(weekStart, 7)}` : `/my-schedule?month=${shiftCalendarMonth(monthKey, 1)}`}><ChevronRight size={20} /></Link>
              </nav>
            </div>
            <div className="my-schedule-summary"><div><span className="stat-icon mint"><Clock3 size={20} /></span><div><small>{isWeek ? "本週預定工作" : "本月預定工作"}</small><strong>{formatScheduledHours(totalMinutes)} 小時</strong></div></div><p>共 {result.entries.length} 個已發布排班日・已扣預定休息</p></div>
            {isWeek ? (
              <div className="my-week-list">
                {dates.map((dateKey) => <article className={dateKey === today ? "my-week-day today" : "my-week-day"} key={dateKey}>
                  <div className="my-week-date"><small>{Number(dateKey.slice(5, 7))} 月</small><strong>{Number(dateKey.slice(-2))}</strong><span>週{weekdays[new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()]}</span></div>
                  <div className="my-week-content"><ShiftDetail entry={entryByDate.get(dateKey)} dayOff={daysOff.has(dateKey)} storeClosed={storeClosed.has(dateKey)} compact /></div>
                </article>)}
              </div>
            ) : (
              <>
                <div className="my-calendar-weekdays">{weekdays.map((day) => <span key={day}>週{day}</span>)}</div>
                <div className="my-month-grid">
                  {dates.map((dateKey) => {
                    const entry = entryByDate.get(dateKey);
                    const outside = !dateKey.startsWith(monthKey);
                    const label = `${dateLabel(dateKey)}，${entry && !outside ? `${entry.shiftName}，${entry.segments.map((segment) => `${shiftMinuteLabel(segment.startMinute)}到${shiftMinuteLabel(segment.endMinute)}`).join("、")}` : outside ? "非本月" : storeClosed.has(dateKey) ? "店休" : daysOff.has(dateKey) ? "休假" : "未排班"}`;
                    return <Link prefetch={false} href={outside ? `/my-schedule?month=${dateKey.slice(0, 7)}&day=${dateKey}` : `/my-schedule?month=${monthKey}&day=${dateKey}#my-day-detail`} aria-label={label} aria-current={dateKey === selectedDay ? "date" : undefined} className={`my-month-day${outside ? " outside" : ""}${dateKey === today ? " today" : ""}${dateKey === selectedDay ? " selected" : ""}`} key={dateKey}>
                      <span className="my-month-date">{Number(dateKey.slice(-2))}{dateKey === today ? <i>今天</i> : null}</span>
                      {!outside && entry ? <span className={`my-shift-badge ${shiftTone(entry)}`}>{entry.shiftName}</span> : !outside && storeClosed.has(dateKey) ? <span className="my-shift-badge closed">店休</span> : !outside && daysOff.has(dateKey) ? <span className="my-shift-badge off">休假</span> : !outside ? <span className="my-no-shift">未排班</span> : null}
                      {!outside && entry ? <span className="my-month-hours">{entry.segments.map((segment) => `${shiftMinuteLabel(segment.startMinute)}–${shiftMinuteLabel(segment.endMinute)}`).join(" / ")}</span> : null}
                    </Link>;
                  })}
                </div>
              </>
            )}
          </section>
          {!isWeek ? <section className="my-day-detail" id="my-day-detail"><div className="my-day-detail-heading"><span className="eyebrow">當日安排</span><h2>{dateLabel(selectedDay)}</h2></div><ShiftDetail entry={entryByDate.get(selectedDay)} dayOff={daysOff.has(selectedDay)} storeClosed={storeClosed.has(selectedDay)} /></section> : null}
        </>
      )}
    </WorkspaceShell>
  );
}
