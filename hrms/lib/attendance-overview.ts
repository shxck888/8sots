import "server-only";

import type { Database } from "@/lib/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AttendanceDay = Database["public"]["Tables"]["attendance_days"]["Row"];
type CorrectionRequest = Database["public"]["Tables"]["punch_correction_requests"]["Row"];
type PunchRecord = Database["public"]["Tables"]["punch_records"]["Row"];

export type AttendanceOverview = {
  days: AttendanceDay[];
  punches: PunchRecord[];
  requests: (CorrectionRequest & { decision: "approved" | "rejected" | null })[];
};

export async function getMyAttendanceOverview(): Promise<AttendanceOverview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_my_attendance_overview", {
    p_day_limit: 31,
    p_punch_limit: 60,
    p_request_limit: 20,
  });
  if (error) throw error;
  const overview = data as unknown as Partial<AttendanceOverview> | null;
  return {
    days: Array.isArray(overview?.days) ? overview.days : [],
    punches: Array.isArray(overview?.punches) ? overview.punches : [],
    requests: Array.isArray(overview?.requests) ? overview.requests : [],
  };
}
