import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202609210033_notification_center.sql"),
  "utf8",
).toLowerCase();

describe("notification center migration", () => {
  it("keeps inbox data tenant-scoped and writable only through owner-checked RPCs", () => {
    expect(migration).toContain("create table public.notifications");
    expect(migration).toContain("alter table public.notifications enable row level security");
    expect(migration).toContain("recipient_user_id = (select auth.uid())");
    expect(migration).toContain("create function public.mark_notification_read");
    expect(migration).toContain("create function public.mark_all_notifications_read");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.notifications[\s\S]*?to authenticated/);
  });

  it("emits application events for requests, attendance, schedules and payroll", () => {
    for (const trigger of [
      "work_request_created_notification", "work_request_decided_notification",
      "correction_created_notification", "correction_decided_notification",
      "schedule_published_notification", "payroll_locked_notification",
    ]) expect(migration).toContain(`create trigger ${trigger}`);
    expect(migration).toContain("unique (tenant_id, recipient_user_id, event_key)");
  });
});
