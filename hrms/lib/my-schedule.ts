import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export { formatScheduledHours, getMonthBounds, taipeiDateKey } from "@/lib/schedule-display";

export type MyScheduleSegment = {
  endMinute: number;
  order: number;
  startMinute: number;
};

export type MyScheduleEntry = {
  shiftCode: string;
  shiftId: string;
  shiftName: string;
  segments: MyScheduleSegment[];
  totalMinutes: number;
  workDate: string;
};

export async function getMyPublishedSchedule({
  dateFrom,
  dateTo,
  employeeId,
}: {
  dateFrom: string;
  dateTo: string;
  employeeId: string | null;
}): Promise<{ employeeId: string | null; entries: MyScheduleEntry[] }> {
  if (!employeeId) return { employeeId: null, entries: [] };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_published_schedule", {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });
  if (error) throw error;

  const entriesByDate = new Map<string, MyScheduleEntry>();
  for (const row of data ?? []) {
    const entry = entriesByDate.get(row.work_date) ?? {
      shiftCode: row.shift_code,
      shiftId: row.shift_id,
      shiftName: row.shift_name,
      segments: [],
      totalMinutes: 0,
      workDate: row.work_date,
    };
    const segment = {
      endMinute: row.end_minute,
      order: row.segment_order,
      startMinute: row.start_minute,
    };
    entry.segments.push(segment);
    entry.totalMinutes += segment.endMinute - segment.startMinute;
    entriesByDate.set(row.work_date, entry);
  }

  return {
    employeeId,
    entries: [...entriesByDate.values()].sort((left, right) => left.workDate.localeCompare(right.workDate)),
  };
}
