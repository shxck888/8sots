import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const foundationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608240001_foundation.sql"),
  "utf8",
).toLowerCase();

const grantsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608240002_data_api_grants.sql"),
  "utf8",
).toLowerCase();

const platformAdminMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250003_platform_admin_permission.sql"),
  "utf8",
).toLowerCase();

const employeeMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250004_employee_management.sql"),
  "utf8",
).toLowerCase();

const employeeAuthLinkFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250005_employee_auth_link_unique_fix.sql"),
  "utf8",
).toLowerCase();

const employeeMasterMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250006_employee_master_details.sql"),
  "utf8",
).toLowerCase();

const employmentTimezoneFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250007_employment_effective_date_timezone_fix.sql"),
  "utf8",
).toLowerCase();

const employeeAuthAccountsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250008_employee_auth_accounts.sql"),
  "utf8",
).toLowerCase();

const preventSelfSuspensionMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250009_prevent_self_account_suspension.sql"),
  "utf8",
).toLowerCase();

const scheduleMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250010_schedule_foundation.sql"),
  "utf8",
).toLowerCase();

const scheduleBatchMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250011_schedule_batch_save.sql"),
  "utf8",
).toLowerCase();

const employeeScheduleVisibilityMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250012_employee_schedule_visibility.sql"),
  "utf8",
).toLowerCase();

const punchFoundationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250013_punch_foundation.sql"),
  "utf8",
).toLowerCase();

const attendanceCalculationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250014_attendance_calculation_and_corrections.sql"),
  "utf8",
).toLowerCase();

const navigationPerformanceMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250015_navigation_performance_rpcs.sql"),
  "utf8",
).toLowerCase();

const holidayCalendarMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250018_holiday_calendar.sql"),
  "utf8",
).toLowerCase();

const holidayCalendarTest = readFileSync(
  join(process.cwd(), "supabase/tests/holiday_calendar.sql"),
  "utf8",
).toLowerCase();

const attendanceRuleMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250019_attendance_rule_management.sql"),
  "utf8",
).toLowerCase();

const attendanceRuleTest = readFileSync(
  join(process.cwd(), "supabase/tests/attendance_rule_management.sql"),
  "utf8",
).toLowerCase();

const workRequestProofMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608250020_work_request_proofs.sql"),
  "utf8",
).toLowerCase();

const workRequestProofTest = readFileSync(
  join(process.cwd(), "supabase/tests/work_request_proofs.sql"),
  "utf8",
).toLowerCase();

const attendanceCorrectionPrecedenceMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608270021_correction_precedence_and_punch_cooldown.sql"),
  "utf8",
).toLowerCase();

const overtimeLimitMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608270022_overtime_eight_hour_limit.sql"),
  "utf8",
).toLowerCase();

const leaveDayRestrictionsMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608270023_leave_day_restrictions.sql"),
  "utf8",
).toLowerCase();

const singleDateLeaveMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608270024_single_date_leave_requests.sql"),
  "utf8",
).toLowerCase();

const taiwanHolidaySeedMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608270025_seed_2026_taiwan_holidays.sql"),
  "utf8",
).toLowerCase();

const overlappingRequestMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608280026_prevent_overlapping_work_requests.sql"),
  "utf8",
).toLowerCase();

const scheduleSeed = readFileSync(
  join(process.cwd(), "supabase/seeds/8sots_schedule_templates.sql"),
  "utf8",
).toLowerCase();

const crossTenantRlsTest = readFileSync(
  join(process.cwd(), "supabase/tests/cross_tenant_rls.sql"),
  "utf8",
).toLowerCase();

const scheduleFoundationTest = readFileSync(
  join(process.cwd(), "supabase/tests/schedule_foundation.sql"),
  "utf8",
).toLowerCase();

const employeeScheduleVisibilityTest = readFileSync(
  join(process.cwd(), "supabase/tests/employee_schedule_visibility.sql"),
  "utf8",
).toLowerCase();

const punchFoundationTest = readFileSync(
  join(process.cwd(), "supabase/tests/punch_foundation.sql"),
  "utf8",
).toLowerCase();

const attendanceCalculationTest = readFileSync(
  join(process.cwd(), "supabase/tests/attendance_calculation.sql"),
  "utf8",
).toLowerCase();

const navigationPerformanceTest = readFileSync(
  join(process.cwd(), "supabase/tests/navigation_performance.sql"),
  "utf8",
).toLowerCase();

const tenantTables = [
  "tenants",
  "tenant_memberships",
  "companies",
  "locations",
  "roles",
  "role_permissions",
  "membership_roles",
  "audit_logs",
];

describe("attendance correction precedence migration", () => {
  it("prefers approved corrections in an overflowing final segment slot", () => {
    expect(attendanceCorrectionPrecedenceMigration).toContain(
      "case when correction_id is not null then 0 else 1 end as source_priority",
    );
    expect(attendanceCorrectionPrecedenceMigration).toContain(
      "least(event_rank, v_segment_count::bigint)",
    );
    expect(attendanceCorrectionPrecedenceMigration).toContain(
      "public.calculate_attendance_v1(uuid,date,date)",
    );
    expect(attendanceCorrectionPrecedenceMigration).toContain(
      "least(v_out_at, v_scheduled_end) - greatest(v_in_at, v_scheduled_start)",
    );
  });

  it("rejects rapid punches without weakening idempotent retries", () => {
    expect(attendanceCorrectionPrecedenceMigration).toContain(
      "if v_punch_id is not null then return v_punch_id; end if",
    );
    expect(attendanceCorrectionPrecedenceMigration).toContain("interval '30 seconds'");
    expect(attendanceCorrectionPrecedenceMigration).toContain("punch cooldown active");
  });
});

describe("overtime duration policy migration", () => {
  it("enforces the eight-hour limit inside the database RPC", () => {
    expect(overtimeLimitMigration).toContain("v_requested_minutes > 480");
    expect(overtimeLimitMigration).toContain("overtime duration must not exceed 480 minutes");
  });
});

describe("leave-day policy migration", () => {
  it("limits leave to Tuesday through Friday and blocks calendar holidays", () => {
    expect(leaveDayRestrictionsMigration).toContain("extract(isodow from covered.day) not between 2 and 5");
    expect(leaveDayRestrictionsMigration).toContain("holiday.kind in ('national', 'company')");
  });
});

describe("single-date leave migration", () => {
  it("rejects leave requests that cover multiple local dates", () => {
    expect(singleDateLeaveMigration).toContain("leave request must cover one local date");
    expect(singleDateLeaveMigration).toContain("p_starts_local::date <>");
  });
});

describe("official 2026 Taiwan holiday seed", () => {
  it("imports named official holidays without generic weekends and records provenance", () => {
    expect(taiwanHolidaySeedMigration).toContain("date '2026-01-01', '開國紀念日'");
    expect(taiwanHolidaySeedMigration).toContain("date '2026-12-25', '行憲紀念日'");
    expect(taiwanHolidaySeedMigration).toContain("https://data.gov.tw/dataset/14718");
    expect(taiwanHolidaySeedMigration).toContain("holiday.official_calendar_imported");
    expect(taiwanHolidaySeedMigration).not.toContain("date '2026-01-03'");
  });
});

describe("work-request overlap prevention", () => {
  it("serializes submissions and ignores only withdrawn or rejected requests", () => {
    expect(overlappingRequestMigration).toContain("pg_advisory_xact_lock");
    expect(overlappingRequestMigration).toContain("existing.starts_at < v_ends_at");
    expect(overlappingRequestMigration).toContain("existing.ends_at > v_starts_at");
    expect(overlappingRequestMigration).toContain("public.work_request_withdrawals");
    expect(overlappingRequestMigration).toContain("decision.decision = 'rejected'");
    expect(overlappingRequestMigration).toContain("work request overlaps an active request");
  });
});

describe("foundation migration contract", () => {
  it.each(tenantTables)("enables RLS for %s", (table) => {
    expect(foundationMigration).toContain(`alter table public.${table} enable row level security`);
  });

  it("does not grant authenticated client writes in the foundation migration", () => {
    expect(foundationMigration).not.toMatch(
      /create policy[\s\S]*?for (insert|update|delete|all) to authenticated/,
    );
  });

  it("uses composite tenant foreign keys for nested organization records", () => {
    expect(foundationMigration).toContain(
      "foreign key (tenant_id, company_id) references public.companies(tenant_id, id)",
    );
    expect(foundationMigration).toContain(
      "foreign key (tenant_id, membership_id) references public.tenant_memberships(tenant_id, id)",
    );
  });

  it("keeps anonymous Data API access disabled", () => {
    expect(grantsMigration).toContain("from anon");
    expect(grantsMigration).not.toMatch(/grant\s+(select|insert|update|delete|all)[\s\S]*?to anon/);
  });

  it("grants authenticated users read-only access to membership resolution tables", () => {
    expect(grantsMigration).toMatch(
      /grant select on table[\s\S]*?public\.tenants[\s\S]*?public\.tenant_memberships[\s\S]*?to authenticated/,
    );
    expect(grantsMigration).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?to authenticated/,
    );
  });

  it("does not expose audit logs to authenticated clients", () => {
    const grantSelectBlock = grantsMigration.match(/grant select on table([\s\S]*?)to authenticated/)?.[1];
    expect(grantSelectBlock).toBeDefined();
    expect(grantSelectBlock).not.toContain("public.audit_logs");
  });

  it("versions the platform administrator permission as reference data", () => {
    expect(platformAdminMigration).toContain("'platform.admin'");
    expect(platformAdminMigration).toContain("on conflict (code) do update");
    expect(platformAdminMigration).not.toContain("auth.users");
  });

  it("creates a tenant-scoped employee table with RLS", () => {
    expect(employeeMigration).toContain("create table public.employees");
    expect(employeeMigration).toContain("tenant_id uuid not null");
    expect(employeeMigration).toContain("unique (tenant_id, employee_no)");
    expect(employeeMigration).toContain("alter table public.employees enable row level security");
    expect(employeeMigration).toContain("employees_select_same_tenant");
  });

  it("keeps employee table writes behind permission-checked RPCs", () => {
    expect(employeeMigration).toContain("current_user_has_permission");
    expect(employeeMigration).toContain("'employee.manage'");
    expect(employeeMigration).toContain("create or replace function public.create_employee");
    expect(employeeMigration).toContain("create or replace function public.update_employee");
    expect(employeeMigration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.employees[\s\S]*?to authenticated/);
  });

  it("writes employee create and update audit evidence", () => {
    expect(employeeMigration).toContain("'employee.created'");
    expect(employeeMigration).toContain("'employee.updated'");
    expect(employeeMigration).toContain("insert into public.audit_logs");
  });

  it("allows multiple employees without Auth links while keeping real links unique", () => {
    expect(employeeAuthLinkFixMigration).toContain(
      "drop constraint if exists employees_tenant_id_auth_user_id_key",
    );
    expect(employeeAuthLinkFixMigration).toContain(
      "on public.employees (tenant_id, auth_user_id)",
    );
    expect(employeeAuthLinkFixMigration).toContain("where auth_user_id is not null");
  });

  it("models employee personal, contact, organization and employment data separately", () => {
    for (const table of ["departments", "positions", "employee_profiles", "employee_contacts", "employment_records"]) {
      expect(employeeMasterMigration).toContain(`create table public.${table}`);
      expect(employeeMasterMigration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(employeeMasterMigration).toContain("create type public.employment_type");
    expect(employeeMasterMigration).toContain("supervisor_employee_id uuid");
    expect(employeeMasterMigration).toContain("probation_end_date date");
    expect(employeeMasterMigration).toContain("termination_date date");
  });

  it("keeps employee photos private and caps accepted files", () => {
    expect(employeeMasterMigration).toContain("'employee-photos', 'employee-photos', false, 3145728");
    expect(employeeMasterMigration).toContain("employee_photos_admin_select");
    expect(employeeMasterMigration).toContain("employee_photos_admin_insert");
  });

  it("versions audited Employee Master mutations", () => {
    expect(employeeMasterMigration).toContain("create_employee_master");
    expect(employeeMasterMigration).toContain("update_employee_master");
    expect(employeeMasterMigration).toContain("public.employee_master_current");
    expect(employeeMasterMigration).toContain("insert into public.audit_logs");
  });

  it("uses the tenant timezone for employment effective dates", () => {
    expect(employmentTimezoneFixMigration).toContain("at time zone t.timezone");
    expect(employmentTimezoneFixMigration).toContain("effective_from >= v_effective_date");
    expect(employmentTimezoneFixMigration).toContain("effective_to = v_effective_date - 1");
  });

  it("provisions employee Auth accounts through permission-checked audited RPCs", () => {
    expect(employeeAuthAccountsMigration).toContain("create table public.employee_auth_accounts");
    expect(employeeAuthAccountsMigration).toContain("alter table public.employee_auth_accounts enable row level security");
    expect(employeeAuthAccountsMigration).toContain("link_employee_auth_account");
    expect(employeeAuthAccountsMigration).toContain("set_employee_auth_account_status");
    expect(employeeAuthAccountsMigration).toContain("record_employee_password_reset");
    expect(employeeAuthAccountsMigration).toContain("employee.account_provisioned");
    expect(employeeAuthAccountsMigration).not.toContain("password text");
  });

  it("prevents administrators from changing their own login status", () => {
    expect(preventSelfSuspensionMigration).toContain("v_account.auth_user_id = (select auth.uid())");
    expect(preventSelfSuspensionMigration).toContain("cannot change own account status");
  });

  it("models tenant-wide shifts as ordered segments and supports cross-midnight offsets", () => {
    expect(scheduleMigration).toContain("create table public.shifts");
    expect(scheduleMigration).toContain("create table public.shift_segments");
    expect(scheduleMigration).toContain("start_minute >= 0 and start_minute < 1440");
    expect(scheduleMigration).toContain("end_minute <= 2880");
    expect(scheduleMigration).toContain("shift segments overlap");
    expect(scheduleMigration).not.toContain("location_id");
  });

  it("creates versioned draft and published schedules with immutable history", () => {
    expect(scheduleMigration).toContain("create table public.schedule_versions");
    expect(scheduleMigration).toContain("create table public.schedule_assignments");
    expect(scheduleMigration).toContain("schedule_versions_one_published_period_idx");
    expect(scheduleMigration).toContain("guard_published_schedule_assignment");
    expect(scheduleMigration).toContain("guard_published_shift_segment");
    expect(scheduleMigration).toContain("published or superseded schedules are immutable");
  });

  it("keeps schedule writes behind permission-checked audited RPCs", () => {
    expect(scheduleMigration).toContain("'schedule.manage'");
    expect(scheduleMigration).toContain("upsert_shift_template");
    expect(scheduleMigration).toContain("create_schedule_draft");
    expect(scheduleMigration).toContain("assign_schedule_shift");
    expect(scheduleMigration).toContain("publish_schedule");
    expect(scheduleMigration).toContain("insert into public.audit_logs");
    expect(scheduleMigration).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?public\.(shifts|shift_segments|schedule_versions|schedule_assignments)[\s\S]*?to authenticated/,
    );
  });

  it("saves weekly assignment edits atomically through one audited RPC", () => {
    expect(scheduleBatchMigration).toContain("save_schedule_assignments");
    expect(scheduleBatchMigration).toContain("current_user_has_permission");
    expect(scheduleBatchMigration).toContain("'schedule.manage'");
    expect(scheduleBatchMigration).toContain("only draft schedules can be changed");
    expect(scheduleBatchMigration).toContain("duplicate employee work date assignment");
    expect(scheduleBatchMigration).toContain("schedule.assignments_saved");
    expect(scheduleBatchMigration).toContain("insert into public.audit_logs");
    expect(scheduleBatchMigration).toContain("schedule_versions_one_draft_period_idx");
    expect(scheduleBatchMigration).toContain("copied_assignments");
  });

  it("versions the actual Seastar weekday and holiday shift templates", () => {
    expect(scheduleSeed).toContain("'weekday_split', '平日班'");
    expect(scheduleSeed).toContain("(v_tenant_id, v_shift_id, 1, 600, 840)");
    expect(scheduleSeed).toContain("(v_tenant_id, v_shift_id, 2, 960, 1260)");
    expect(scheduleSeed).toContain("'holiday_continuous', '假日班'");
    expect(scheduleSeed).toContain("(v_tenant_id, v_shift_id, 1, 600, 1260)");
  });

  it("limits employee schedule reads to self and published versions", () => {
    expect(employeeScheduleVisibilityMigration).toContain(
      "schedule_assignments_select_manager_or_self_published",
    );
    expect(employeeScheduleVisibilityMigration).toContain("current_user_has_permission");
    expect(employeeScheduleVisibilityMigration).toContain("'schedule.manage'");
    expect(employeeScheduleVisibilityMigration).toContain("e.auth_user_id = (select auth.uid())");
    expect(employeeScheduleVisibilityMigration).toContain("sv.status = 'published'");
    expect(employeeScheduleVisibilityMigration).not.toMatch(
      /create policy[\s\S]*?for (insert|update|delete|all) to authenticated/,
    );
  });

  it("tests employee schedule visibility with rollback-only production fixtures", () => {
    expect(employeeScheduleVisibilityTest).toMatch(/^--[\s\S]*?begin;/);
    expect(employeeScheduleVisibilityTest.trim()).toMatch(/rollback;$/);
    expect(employeeScheduleVisibilityTest).not.toContain("commit;");
    expect(employeeScheduleVisibilityTest).toContain("employee published schedule read failed");
    expect(employeeScheduleVisibilityTest).toContain("other employee schedule leaked");
    expect(employeeScheduleVisibilityTest).toContain("draft employee schedule leaked");
  });

  it("creates append-only server-authoritative GPS punch evidence", () => {
    expect(punchFoundationMigration).toContain("create table public.punch_records");
    expect(punchFoundationMigration).toContain("occurred_at timestamptz not null default statement_timestamp()");
    expect(punchFoundationMigration).toContain("punch_records_append_only");
    expect(punchFoundationMigration).toContain("raw punch records are append-only");
    expect(punchFoundationMigration).toContain("location_consent_at");
    expect(punchFoundationMigration).toContain("unique (tenant_id, employee_id, idempotency_key)");
  });

  it("keeps GPS writes behind an identity-checked audited RPC", () => {
    expect(punchFoundationMigration).toContain("record_gps_punch");
    expect(punchFoundationMigration).toContain("active linked employee required");
    expect(punchFoundationMigration).toContain("location consent required");
    expect(punchFoundationMigration).toContain("pg_advisory_xact_lock");
    expect(punchFoundationMigration).toContain("client timestamp outside allowed window");
    expect(punchFoundationMigration).toContain("invalid gps evidence");
    expect(punchFoundationMigration).toContain("'punch.recorded'");
    expect(punchFoundationMigration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.punch_records[\s\S]*?to authenticated/);
  });

  it("limits punch reads to self or attendance managers", () => {
    expect(punchFoundationMigration).toContain("'attendance.manage'");
    expect(punchFoundationMigration).toContain("punch_records_select_manager_or_self");
    expect(punchFoundationMigration).toContain("e.auth_user_id = (select auth.uid())");
  });

  it("keeps punch integration fixtures rollback-only and covers critical boundaries", () => {
    expect(punchFoundationTest).toMatch(/^--[\s\S]*?begin;/);
    expect(punchFoundationTest.trim()).toMatch(/rollback;$/);
    expect(punchFoundationTest).not.toContain("commit;");
    expect(punchFoundationTest).toContain("first punch was not clock_in");
    expect(punchFoundationTest).toContain("second punch was not clock_out");
    expect(punchFoundationTest).toContain("idempotent punch duplicated");
    expect(punchFoundationTest).toContain("direct punch insert unexpectedly succeeded");
    expect(punchFoundationTest).toContain("punch mutation unexpectedly succeeded");
  });

  it("versions attendance calculation snapshots and independent corrections", () => {
    for (const table of ["attendance_rule_sets", "attendance_calculation_runs", "attendance_days", "attendance_segments", "attendance_exceptions", "punch_correction_requests", "punch_correction_decisions"]) {
      expect(attendanceCalculationMigration).toContain(`create table public.${table}`);
      expect(attendanceCalculationMigration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(attendanceCalculationMigration).toContain("request_punch_correction");
    expect(attendanceCalculationMigration).toContain("decide_punch_correction");
    expect(attendanceCalculationMigration).toContain("calculate_attendance");
    expect(attendanceCalculationMigration).toContain("statement_timestamp()");
    expect(attendanceCalculationMigration).toContain("'attendance.calculated'");
    expect(attendanceCalculationMigration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?public\.attendance_days[\s\S]*?to authenticated/);
  });

  it("keeps attendance integration fixtures rollback-only", () => {
    expect(attendanceCalculationTest).toMatch(/^--[\s\S]*?begin;/);
    expect(attendanceCalculationTest.trim()).toMatch(/rollback;$/);
    expect(attendanceCalculationTest).not.toContain("commit;");
    expect(attendanceCalculationTest).toContain("missing clock out was not detected");
    expect(attendanceCalculationTest).toContain("approved correction was not included in recalculation");
    expect(attendanceCalculationTest).toContain("attendance calculation history was overwritten");
    expect(attendanceCalculationTest).toContain("direct attendance write unexpectedly succeeded");
  });

  it("aggregates navigation identity, schedule and attendance reads into bounded RPCs", () => {
    expect(navigationPerformanceMigration).toContain("get_current_workspace_context");
    expect(navigationPerformanceMigration).toContain("get_my_published_schedule");
    expect(navigationPerformanceMigration).toContain("get_my_attendance_overview");
    expect(navigationPerformanceMigration.match(/security definer/g)).toHaveLength(3);
    expect(navigationPerformanceMigration).toContain("from public, anon");
    expect(navigationPerformanceMigration).toContain("to authenticated");
  });

  it("keeps navigation RPC integration checks rollback-only", () => {
    expect(navigationPerformanceTest).toMatch(/^--[\s\S]*?begin;/);
    expect(navigationPerformanceTest.trim()).toMatch(/rollback;$/);
    expect(navigationPerformanceTest).not.toContain("commit;");
    expect(navigationPerformanceTest).toContain("workspace bootstrap did not return exactly one row");
    expect(navigationPerformanceTest).toContain("anonymous workspace bootstrap unexpectedly succeeded");
  });

  it("keeps schedule integration fixtures rollback-only and covers critical boundaries", () => {
    expect(scheduleFoundationTest).toMatch(/^--[\s\S]*?begin;/);
    expect(scheduleFoundationTest.trim()).toMatch(/rollback;$/);
    expect(scheduleFoundationTest).not.toContain("commit;");
    expect(scheduleFoundationTest).toContain("weekday shift minutes mismatch");
    expect(scheduleFoundationTest).toContain("cross-midnight shift minutes mismatch");
    expect(scheduleFoundationTest).toContain("overlapping shift segments unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("cross-tenant schedule rpc unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("published schedule mutation unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("published shift mutation unexpectedly succeeded");
    expect(scheduleFoundationTest).toContain("published schedule clone failed");
    expect(scheduleFoundationTest).toContain("batch schedule assignment save failed");
  });

  it("creates a tenant-scoped holiday calendar behind permission-checked audited RPCs", () => {
    expect(holidayCalendarMigration).toContain("create table public.holiday_calendar_entries");
    expect(holidayCalendarMigration).toContain("create type public.holiday_kind");
    expect(holidayCalendarMigration).toContain("unique (tenant_id, holiday_date)");
    expect(holidayCalendarMigration).toContain("alter table public.holiday_calendar_entries enable row level security");
    expect(holidayCalendarMigration).toContain("holiday_calendar_entries_select_same_tenant");
    expect(holidayCalendarMigration).toContain("current_user_has_permission");
    expect(holidayCalendarMigration).toContain("'schedule.manage'");
    expect(holidayCalendarMigration).toContain("upsert_holiday_entry");
    expect(holidayCalendarMigration).toContain("delete_holiday_entry");
    expect(holidayCalendarMigration).toContain("'holiday.created'");
    expect(holidayCalendarMigration).toContain("'holiday.deleted'");
    expect(holidayCalendarMigration).toContain("insert into public.audit_logs");
    expect(holidayCalendarMigration).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?public\.holiday_calendar_entries[\s\S]*?to authenticated/,
    );
  });

  it("keeps the holiday calendar integration fixture rollback-only", () => {
    expect(holidayCalendarTest).toMatch(/^--[\s\S]*?begin;/);
    expect(holidayCalendarTest.trim()).toMatch(/rollback;$/);
    expect(holidayCalendarTest).not.toContain("commit;");
    expect(holidayCalendarTest).toContain("holiday upsert failed");
    expect(holidayCalendarTest).toContain("holiday duplicate date did not update");
    expect(holidayCalendarTest).toContain("cross-tenant holiday leaked");
    expect(holidayCalendarTest).toContain("unauthorized holiday write unexpectedly succeeded");
  });

  it("publishes new attendance rule set versions through a permission-checked audited RPC", () => {
    expect(attendanceRuleMigration).toContain("create_attendance_rule_set");
    expect(attendanceRuleMigration).toContain("current_user_has_permission");
    expect(attendanceRuleMigration).toContain("'attendance.manage'");
    expect(attendanceRuleMigration).toContain("coalesce(max(version), 0) + 1");
    expect(attendanceRuleMigration).toContain("late grace minutes out of range");
    expect(attendanceRuleMigration).toContain("early leave grace minutes out of range");
    expect(attendanceRuleMigration).toContain("'attendance.rule_set_created'");
    expect(attendanceRuleMigration).toContain("insert into public.audit_logs");
  });

  it("keeps the attendance rule management fixture rollback-only", () => {
    expect(attendanceRuleTest).toMatch(/^--[\s\S]*?begin;/);
    expect(attendanceRuleTest.trim()).toMatch(/rollback;$/);
    expect(attendanceRuleTest).not.toContain("commit;");
    expect(attendanceRuleTest).toContain("rule set version was not incremented");
    expect(attendanceRuleTest).toContain("out-of-range rule set unexpectedly succeeded");
    expect(attendanceRuleTest).toContain("unauthorized rule set write unexpectedly succeeded");
  });

  it("stores work request proofs in a private bucket behind an owner-checked audited RPC", () => {
    expect(workRequestProofMigration).toContain("create table public.work_request_attachments");
    expect(workRequestProofMigration).toContain("alter table public.leave_types");
    expect(workRequestProofMigration).toContain("requires_proof");
    expect(workRequestProofMigration).toContain("'work-request-proofs', 'work-request-proofs', false, 5242880");
    expect(workRequestProofMigration).toContain("work_request_proofs_owner_insert");
    expect(workRequestProofMigration).toContain("work_request_proofs_reader_select");
    expect(workRequestProofMigration).toContain("attach_work_request_proof");
    expect(workRequestProofMigration).toContain("only own request proof can be attached");
    expect(workRequestProofMigration).toContain("'work_request.proof_attached'");
    expect(workRequestProofMigration).not.toMatch(
      /grant\s+(insert|update|delete|all)[\s\S]*?public\.work_request_attachments[\s\S]*?to authenticated/,
    );
  });

  it("keeps the work request proof fixture rollback-only", () => {
    expect(workRequestProofTest).toMatch(/^--[\s\S]*?begin;/);
    expect(workRequestProofTest.trim()).toMatch(/rollback;$/);
    expect(workRequestProofTest).not.toContain("commit;");
    expect(workRequestProofTest).toContain("proof attachment failed");
    expect(workRequestProofTest).toContain("unauthorized proof attach unexpectedly succeeded");
    expect(workRequestProofTest).toContain("withdrawn request proof attach unexpectedly succeeded");
  });

  it("keeps the cross-tenant RLS integration fixture transaction-scoped", () => {
    expect(crossTenantRlsTest).toMatch(/^--[\s\S]*?begin;/);
    expect(crossTenantRlsTest.trim()).toMatch(/rollback;$/);
    expect(crossTenantRlsTest).not.toContain("commit;");
  });

  it("asserts same-tenant reads and cross-tenant isolation boundaries", () => {
    expect(crossTenantRlsTest).toContain("same-tenant read failed");
    expect(crossTenantRlsTest).toContain("cross-tenant tenant read leaked");
    expect(crossTenantRlsTest).toContain("cross-tenant employee read leaked");
    expect(crossTenantRlsTest).toContain("authenticated client write unexpectedly succeeded");
    expect(crossTenantRlsTest).toContain("anonymous read unexpectedly succeeded");
    expect(crossTenantRlsTest).toContain("cross-tenant rpc unexpectedly succeeded");
    expect(crossTenantRlsTest).toContain("cross-tenant foreign key unexpectedly succeeded");
  });
});
