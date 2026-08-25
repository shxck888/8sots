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

type ScheduleVersionRow = {
  id: string;
  published_at: string | null;
  version: number;
};

export async function getMyPublishedSchedule({
  dateFrom,
  dateTo,
  tenantId,
  userId,
}: {
  dateFrom: string;
  dateTo: string;
  tenantId: string;
  userId: string;
}): Promise<{ employeeId: string | null; entries: MyScheduleEntry[] }> {
  const supabase = await createSupabaseServerClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (employeeError) throw employeeError;
  if (!employee) return { employeeId: null, entries: [] };

  const { data: versions, error: versionError } = await supabase
    .from("schedule_versions")
    .select("id, published_at, version")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .lte("period_start", dateTo)
    .gte("period_end", dateFrom);
  if (versionError) throw versionError;
  if (!versions?.length) return { employeeId: employee.id, entries: [] };

  const versionIds = versions.map((version) => version.id);
  const { data: assignments, error: assignmentError } = await supabase
    .from("schedule_assignments")
    .select("schedule_version_id, shift_id, work_date")
    .eq("tenant_id", tenantId)
    .eq("employee_id", employee.id)
    .gte("work_date", dateFrom)
    .lte("work_date", dateTo)
    .in("schedule_version_id", versionIds);
  if (assignmentError) throw assignmentError;
  if (!assignments?.length) return { employeeId: employee.id, entries: [] };

  const shiftIds = [...new Set(assignments.map((assignment) => assignment.shift_id))];
  const [{ data: shifts, error: shiftError }, { data: segments, error: segmentError }] = await Promise.all([
    supabase.from("shifts").select("id, code, name").eq("tenant_id", tenantId).in("id", shiftIds),
    supabase
      .from("shift_segments")
      .select("shift_id, segment_order, start_minute, end_minute")
      .eq("tenant_id", tenantId)
      .in("shift_id", shiftIds)
      .order("segment_order"),
  ]);
  if (shiftError) throw shiftError;
  if (segmentError) throw segmentError;

  const versionById = new Map((versions as ScheduleVersionRow[]).map((version) => [version.id, version]));
  const shiftById = new Map((shifts ?? []).map((shift) => [shift.id, shift]));
  const segmentsByShift = new Map<string, MyScheduleSegment[]>();
  for (const segment of segments ?? []) {
    const current = segmentsByShift.get(segment.shift_id) ?? [];
    current.push({
      endMinute: segment.end_minute,
      order: segment.segment_order,
      startMinute: segment.start_minute,
    });
    segmentsByShift.set(segment.shift_id, current);
  }

  const assignmentByDate = new Map<string, (typeof assignments)[number]>();
  for (const assignment of assignments) {
    const current = assignmentByDate.get(assignment.work_date);
    if (!current) {
      assignmentByDate.set(assignment.work_date, assignment);
      continue;
    }
    const currentVersion = versionById.get(current.schedule_version_id);
    const nextVersion = versionById.get(assignment.schedule_version_id);
    const currentPublishedAt = currentVersion?.published_at ?? "";
    const nextPublishedAt = nextVersion?.published_at ?? "";
    if (nextPublishedAt > currentPublishedAt
      || (nextPublishedAt === currentPublishedAt && (nextVersion?.version ?? 0) > (currentVersion?.version ?? 0))) {
      assignmentByDate.set(assignment.work_date, assignment);
    }
  }

  const entries = [...assignmentByDate.values()].flatMap((assignment) => {
    const shift = shiftById.get(assignment.shift_id);
    if (!shift) return [];
    const shiftSegments = segmentsByShift.get(assignment.shift_id) ?? [];
    return [{
      shiftCode: shift.code,
      shiftId: shift.id,
      shiftName: shift.name,
      segments: shiftSegments,
      totalMinutes: shiftSegments.reduce((total, segment) => total + segment.endMinute - segment.startMinute, 0),
      workDate: assignment.work_date,
    }];
  }).sort((left, right) => left.workDate.localeCompare(right.workDate));

  return { employeeId: employee.id, entries };
}
