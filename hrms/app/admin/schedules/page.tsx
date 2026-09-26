import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Info, Plus, Save } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  assignmentFieldName,
  buildWeekDates,
  DAY_OFF_VALUE,
  defaultShiftCodeForDate,
  getWeekStart,
  HOLIDAY_SHIFT_CODE,
  isMonday,
  shiftMinuteLabel,
  STORE_CLOSED_VALUE,
  toIsoDate,
  WEEKDAY_SHIFT_CODE,
} from "@/lib/schedules";
import { computeScheduleWarnings, type ScheduleWarning } from "@/lib/schedule-warnings";
import type { HolidayKind } from "@/lib/holidays";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createScheduleDraft, publishSchedule, saveScheduleDraft } from "./actions";
import { PublishButton } from "./publish-button";

function ScheduleWarnings({ warnings }: { warnings: ScheduleWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <section aria-label="發布前提醒" className="schedule-warnings">
      {warnings.map((warning) => (
        <div className={`schedule-warning ${warning.level}`} key={warning.code + warning.message}>
          {warning.level === "warn" ? <AlertTriangle size={16} /> : <Info size={16} />}
          <span>{warning.message}</span>
        </div>
      ))}
    </section>
  );
}

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  period: "排班週期格式不正確。",
  permission: "你沒有維護排班的權限。",
  locked: "這份班表已發布並鎖定，請建立新版草稿。",
  missing: "員工、班別或班表版本不存在，請重新整理。",
  assignment: "排班內容格式不正確，請重新選擇。",
  save: "排班儲存失敗，請稍後再試。",
};

function moveWeek(weekStart: string, days: number): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric", day: "numeric", weekday: "short", timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export default async function SchedulesPage({ searchParams }: {
  searchParams: Promise<{
    week?: string; draft?: string; saved?: string; published?: string; error?: string;
  }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect("/");

  const weekStart = getWeekStart(params.week);
  const weekDates = buildWeekDates(weekStart);
  const weekEnd = weekDates[6];
  const displayDates = [weekDates[6], ...weekDates.slice(0, 6)];
  const supabase = await createSupabaseServerClient();

  const [employeesResult, shiftsResult, segmentsResult, versionsResult, holidaysResult] = await Promise.all([
    supabase.from("employees").select("id, employee_no, full_name")
      .eq("tenant_id", admin.tenantId).eq("status", "active").order("employee_no"),
    supabase.from("shifts").select("id, code, name")
      .eq("tenant_id", admin.tenantId).eq("status", "active").order("code"),
    supabase.from("shift_segments").select("shift_id, segment_order, start_minute, end_minute")
      .eq("tenant_id", admin.tenantId).order("segment_order"),
    supabase.from("schedule_versions").select("id, version, status, published_at")
      .eq("tenant_id", admin.tenantId).eq("period_start", weekStart).eq("period_end", weekEnd)
      .order("version", { ascending: false }),
    supabase.from("holiday_calendar_entries").select("holiday_date, name, kind")
      .eq("tenant_id", admin.tenantId).gte("holiday_date", weekStart).lte("holiday_date", weekEnd),
  ]);

  const employees = employeesResult.data ?? [];
  const shifts = shiftsResult.data ?? [];
  const segments = segmentsResult.data ?? [];
  const versions = versionsResult.data ?? [];
  const holidays = (holidaysResult.data ?? []).map((entry) => ({
    holiday_date: entry.holiday_date,
    name: entry.name,
    kind: entry.kind as HolidayKind,
  }));
  const holidayKindByDate = new Map(holidays.map((entry) => [entry.holiday_date, entry.kind]));
  const draft = versions.find((version) => version.status === "draft") ?? null;
  const published = versions.find((version) => version.status === "published") ?? null;
  const selectedVersion = draft ?? published;

  const assignmentsResult = selectedVersion
    ? await supabase.from("schedule_assignments").select("employee_id, work_date, shift_id, is_day_off, is_store_closed")
      .eq("tenant_id", admin.tenantId).eq("schedule_version_id", selectedVersion.id)
    : { data: [], error: null };
  const assignmentRows = assignmentsResult.data ?? [];
  const assignmentMap = new Map(
    assignmentRows.map((item) => [`${item.employee_id}:${item.work_date}`, item.is_store_closed ? STORE_CLOSED_VALUE : item.is_day_off ? DAY_OFF_VALUE : item.shift_id]),
  );
  const scheduleWarnings = computeScheduleWarnings({
    weekDates, employees, holidays, assignments: assignmentRows,
  });
  const shiftLabels = new Map(shifts.map((shift) => {
    const shiftSegments = segments.filter((segment) => segment.shift_id === shift.id);
    const parts = shiftSegments
      .map((segment) => `${shiftMinuteLabel(segment.start_minute)}–${shiftMinuteLabel(segment.end_minute)}`);
    const lunch = shift.code === "WEEKDAY_SPLIT" && shiftSegments.length === 2
      ? ` · 午休 ${shiftMinuteLabel(shiftSegments[0].end_minute)}–${shiftMinuteLabel(shiftSegments[1].start_minute)}`
      : "";
    return [shift.id, `${shift.name} · ${parts.join("、")}${lunch}`];
  }));
  const defaultShifts = new Map(shifts
    .filter((shift) => shift.code === WEEKDAY_SHIFT_CODE || shift.code === HOLIDAY_SHIFT_CODE)
    .map((shift) => [shift.code, shift]));
  const loadError = employeesResult.error || shiftsResult.error || segmentsResult.error
    || versionsResult.error || assignmentsResult.error;

  return (
    <>
      <header className="admin-page-header schedule-header">
        <div><span className="admin-eyebrow">SCHEDULE</span><h1>週排班</h1><p>建立草稿、安排每日班別，確認後再發布。</p></div>
        <div className="schedule-week-nav">
          <Link aria-label="上一週" href={`/admin/schedules?week=${moveWeek(weekStart, -7)}`}><ChevronLeft size={17} /></Link>
          <strong>{weekStart.replaceAll("-", "/")} — {weekEnd.replaceAll("-", "/")}</strong>
          <Link aria-label="下一週" href={`/admin/schedules?week=${moveWeek(weekStart, 7)}`}><ChevronRight size={17} /></Link>
        </div>
      </header>

      {params.draft ? <div className="admin-success">排班草稿已建立，預設班別已自動套用。</div> : null}
      {params.saved ? <div className="admin-success">排班草稿已儲存。</div> : null}
      {params.published ? <div className="admin-success">班表已發布並鎖定。</div> : null}
      {params.error ? <div className="admin-form-error schedule-message">{errorMessages[params.error] ?? errorMessages.save}</div> : null}

      <section className="schedule-summary">
        <article><span><CalendarDays size={18} /></span><div><small>目前版本</small><strong>{selectedVersion ? `V${selectedVersion.version}` : "尚未建立"}</strong></div></article>
        <article><div><small>狀態</small><strong className={`schedule-status ${selectedVersion?.status ?? "empty"}`}>{selectedVersion?.status === "draft" ? "草稿" : selectedVersion?.status === "published" ? "已發布" : "未排班"}</strong></div></article>
        <article><div><small>在職員工</small><strong>{employees.length} 位</strong></div></article>
        <article><div><small>已指定班次</small><strong>{assignmentRows.filter((item) => item.shift_id).length} 格</strong></div></article>
      </section>

      {loadError ? (
        <section className="admin-panel admin-empty"><strong>排班資料讀取失敗</strong><p>請確認最新 database migration 已完成。</p></section>
      ) : !defaultShifts.has(WEEKDAY_SHIFT_CODE) || !defaultShifts.has(HOLIDAY_SHIFT_CODE) ? (
        <section className="admin-panel admin-empty"><strong>預設班別尚未完整建立</strong><p>請先建立平日班與假日班。</p></section>
      ) : employees.length === 0 ? (
        <section className="admin-panel admin-empty"><strong>沒有可排班的在職員工</strong><p>請先在員工管理建立在職員工。</p></section>
      ) : !draft && !published ? (
        <section className="admin-panel schedule-empty">
          <CalendarDays size={34} /><strong>本週尚未建立排班</strong>
          <p>週一預設例假（店休），其他日期套用平日班或假日班；可逐日調整。</p>
          <form action={createScheduleDraft}>
            <input name="periodStart" type="hidden" value={weekStart} />
            <input name="periodEnd" type="hidden" value={weekEnd} />
            <button className="admin-button primary" type="submit"><Plus size={16} /> 建立本週草稿</button>
          </form>
        </section>
      ) : !draft && published ? (
        <section className="admin-panel schedule-panel">
          <div className="schedule-toolbar">
            <div>
              <strong>已發布班表 V{published.version}</strong>
              <span>此版本為唯讀；需要調整時請建立新版草稿，舊版會保留至新版發布。</span>
            </div>
            <form action={createScheduleDraft}>
              <input name="periodStart" type="hidden" value={weekStart} />
              <input name="periodEnd" type="hidden" value={weekEnd} />
              <button className="admin-button primary" type="submit"><Plus size={16} /> 建立新版草稿</button>
            </form>
          </div>
          <div className="schedule-grid-wrap">
            <table className="schedule-grid schedule-grid-readonly">
              <thead><tr><th>員工</th>{displayDates.map((date) => <th key={date}>{dateLabel(date)}</th>)}</tr></thead>
              <tbody>{employees.map((employee) => (
                <tr key={employee.id}>
                  <th><strong>{employee.full_name}</strong><small>{employee.employee_no}</small></th>
                  {displayDates.map((date) => {
                    const selection = assignmentMap.get(`${employee.id}:${date}`);
                    return (
                      <td key={date}>
                        <div className={selection === STORE_CLOSED_VALUE ? "schedule-readonly-closed" : selection === DAY_OFF_VALUE ? "schedule-readonly-off" : selection ? "schedule-readonly-shift" : "schedule-readonly-empty"}>
                          {selection === STORE_CLOSED_VALUE ? "例假（店休）" : selection === DAY_OFF_VALUE ? "休息日（休假）" : selection ? shiftLabels.get(selection) ?? "班別資料不存在" : "未排班"}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
          <form action={saveScheduleDraft} className="admin-panel schedule-panel">
            <input name="scheduleVersionId" type="hidden" value={draft!.id} />
            <input name="weekStart" type="hidden" value={weekStart} />
            <div className="schedule-toolbar">
              <div><strong>草稿 V{draft!.version}</strong><span>週一預設例假（店休）；如有開店，可改為平日班。未排班與休息日（休假）可個別選擇。</span></div>
              <button className="admin-button primary" type="submit"><Save size={16} /> 儲存草稿</button>
            </div>
            <div className="schedule-grid-wrap">
              <table className="schedule-grid">
                <thead><tr><th>員工</th>{displayDates.map((date) => <th key={date}>{dateLabel(date)}</th>)}</tr></thead>
                <tbody>{employees.map((employee) => (
                  <tr key={employee.id}>
                    <th><strong>{employee.full_name}</strong><small>{employee.employee_no}</small></th>
                    {displayDates.map((date) => {
                      const shiftCode = defaultShiftCodeForDate(date, holidayKindByDate.get(date));
                      const defaultShift = shiftCode ? defaultShifts.get(shiftCode) : null;
                      const monday = isMonday(date);
                      const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
                      const mondayOpenShift = monday && holidayKindByDate.get(date) !== "company" ? defaultShifts.get(WEEKDAY_SHIFT_CODE) : null;
                      const mondayHolidayShift = monday && holidayKindByDate.get(date) === "national" ? defaultShifts.get(HOLIDAY_SHIFT_CODE) : null;
                      return (
                        <td key={date}>
                          <select
                            aria-label={`${employee.full_name} ${date} 安排`}
                            defaultValue={assignmentMap.get(`${employee.id}:${date}`) ?? ""}
                            name={assignmentFieldName(employee.id, date)}
                          >
                            {monday ? <option value={STORE_CLOSED_VALUE}>例假（店休）</option> : null}
                            {defaultShift ? <option value={defaultShift.id}>{shiftLabels.get(defaultShift.id)}</option> : null}
                            {mondayOpenShift ? <option value={mondayOpenShift.id}>{shiftLabels.get(mondayOpenShift.id)}</option> : null}
                            {mondayHolidayShift ? <option value={mondayHolidayShift.id}>{shiftLabels.get(mondayHolidayShift.id)}</option> : null}
                            <option value={DAY_OFF_VALUE}>休息日（休假）</option>
                            <option value="">未排班</option>
                            {weekday >= 2 && weekday <= 5 ? <option value={STORE_CLOSED_VALUE}>例假（店休）</option> : null}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </form>
          <ScheduleWarnings warnings={scheduleWarnings} />
          <div className="schedule-publish-bar">
            <div><strong>發布本週班表</strong><span>{assignmentMap.size === 0 ? "至少指定一個班次、休息日（休假）或例假（店休）並儲存後才能發布。" : "請先儲存草稿。發布後本版本不可直接修改。"}</span></div>
            <form action={publishSchedule}>
              <input name="scheduleVersionId" type="hidden" value={draft!.id} />
              <input name="weekStart" type="hidden" value={weekStart} />
              <PublishButton disabled={assignmentMap.size === 0} />
            </form>
          </div>
        </>
      )}
    </>
  );
}
