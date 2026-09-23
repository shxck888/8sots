import { holidayKindLabels, type HolidayKind } from "./holidays";

export type ScheduleWarningLevel = "warn" | "info";

export type ScheduleWarning = {
  level: ScheduleWarningLevel;
  code: string;
  message: string;
};

export type ScheduleWarningEmployee = {
  id: string;
  full_name: string;
  employee_no: string;
};

export type ScheduleWarningHoliday = {
  holiday_date: string;
  name: string;
  kind: HolidayKind;
};

export type ScheduleWarningAssignment = {
  employee_id: string;
  work_date: string;
  shift_id: string | null;
};

export type ScheduleWarningInput = {
  weekDates: string[];
  employees: ScheduleWarningEmployee[];
  holidays: ScheduleWarningHoliday[];
  assignments: ScheduleWarningAssignment[];
};

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * Advisory pre-publish integrity checks for a weekly schedule. All findings are
 * advisory. Default weekday/holiday shifts are enforced while editing; warnings
 * surface remaining coverage concerns before the manager locks the week.
 */
export function computeScheduleWarnings(input: ScheduleWarningInput): ScheduleWarning[] {
  const { weekDates, employees, holidays, assignments } = input;
  const warnings: ScheduleWarning[] = [];
  const weekSet = new Set(weekDates);

  const scheduled = assignments.filter((a) => a.shift_id && weekSet.has(a.work_date));

  if (employees.length > 0 && scheduled.length === 0) {
    warnings.push({
      level: "warn",
      code: "empty_week",
      message: "本週尚未安排任何班別。",
    });
  }

  // Active employees with no assignment anywhere in the week.
  const assignedEmployeeIds = new Set(scheduled.map((a) => a.employee_id));
  const unassigned = employees.filter((e) => !assignedEmployeeIds.has(e.id));
  if (scheduled.length > 0 && unassigned.length > 0) {
    const names = unassigned.map((e) => e.full_name).join("、");
    warnings.push({
      level: "warn",
      code: "employee_no_shift",
      message: `整週未排任何班的員工：${names}。請確認休假日已明確選擇「休假」，其餘未排班日仍待安排。`,
    });
  }

  // Holiday / make-up workday coverage mismatches within the week.
  const scheduledByDate = new Map<string, number>();
  for (const a of scheduled) {
    scheduledByDate.set(a.work_date, (scheduledByDate.get(a.work_date) ?? 0) + 1);
  }
  for (const holiday of holidays) {
    if (!weekSet.has(holiday.holiday_date)) continue;
    const count = scheduledByDate.get(holiday.holiday_date) ?? 0;
    const label = holidayKindLabels[holiday.kind];
    if (holiday.kind === "makeup_workday") {
      if (count === 0) {
        warnings.push({
          level: "info",
          code: "makeup_workday_unscheduled",
          message: `${shortDate(holiday.holiday_date)} 為${label}（${holiday.name}），目前尚未排班。`,
        });
      }
    } else if (holiday.kind === "company" && count > 0) {
      warnings.push({
        level: "info",
        code: "holiday_scheduled",
        message: `${shortDate(holiday.holiday_date)} 為${label}（${holiday.name}），仍有 ${count} 位員工排班，請確認。`,
      });
    }
  }

  return warnings;
}
