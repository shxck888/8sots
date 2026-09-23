import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const migrationsDirectory = join(process.cwd(), "supabase/migrations");
const fixtureIds = {
  tenant: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000002",
  employeeUser: "10000000-0000-4000-8000-000000000003",
  outsider: "10000000-0000-4000-8000-000000000004",
  company: "10000000-0000-4000-8000-000000000005",
  role: "10000000-0000-4000-8000-000000000006",
  employee: "10000000-0000-4000-8000-000000000007",
  overnightUser: "10000000-0000-4000-8000-000000000020",
  overnightEmployee: "10000000-0000-4000-8000-000000000021",
  weekdayShift: "10000000-0000-4000-8000-000000000010",
  holidayShift: "10000000-0000-4000-8000-000000000011",
  overnightShift: "10000000-0000-4000-8000-000000000012",
};

let db: PGlite;

async function setUser(userId: string) {
  await db.exec(`select set_config('request.jwt.claim.sub','${userId}',false)`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name,'/')
    $$;
  `);

  for (const file of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(migrationsDirectory, file), "utf8")
      .replace(/create extension if not exists pgcrypto;\s*/gi, "");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }

  await db.exec(`
    insert into auth.users(id,email) values
      ('${fixtureIds.admin}','admin@example.test'),
      ('${fixtureIds.employeeUser}','employee@example.test'),
      ('${fixtureIds.outsider}','outsider@example.test');
    insert into public.tenants(id,name,slug) values('${fixtureIds.tenant}','Integration Tenant','integration-tenant');
    insert into public.companies(id,tenant_id,name) values('${fixtureIds.company}','${fixtureIds.tenant}','Test Company');
    insert into public.tenant_memberships(tenant_id,user_id,status) values
      ('${fixtureIds.tenant}','${fixtureIds.admin}','active'),
      ('${fixtureIds.tenant}','${fixtureIds.employeeUser}','active');
    insert into public.roles(id,tenant_id,code,name,is_system) values('${fixtureIds.role}','${fixtureIds.tenant}','platform_admin','Platform Admin',true);
    insert into public.membership_roles(tenant_id,membership_id,role_id)
      select tenant_id,id,'${fixtureIds.role}' from public.tenant_memberships where user_id='${fixtureIds.admin}';
    insert into public.role_permissions(tenant_id,role_id,permission_id)
      select '${fixtureIds.tenant}','${fixtureIds.role}',id from public.permissions on conflict do nothing;
    insert into public.employees(id,tenant_id,auth_user_id,employee_no,full_name,hire_date,status)
      values('${fixtureIds.employee}','${fixtureIds.tenant}','${fixtureIds.employeeUser}','E001','測試員工','2026-01-01','active');
    insert into public.employee_auth_accounts(employee_id,tenant_id,auth_user_id,username,status)
      values('${fixtureIds.employee}','${fixtureIds.tenant}','${fixtureIds.employeeUser}','employee001','active');
    insert into public.employment_records(tenant_id,employee_id,employment_type,hire_date,status,effective_from)
      values('${fixtureIds.tenant}','${fixtureIds.employee}','full_time','2026-01-01','active','2026-01-01');
    insert into public.shifts(id,tenant_id,code,name,status) values
      ('${fixtureIds.weekdayShift}','${fixtureIds.tenant}','WEEKDAY_SPLIT','平日班','active'),
      ('${fixtureIds.holidayShift}','${fixtureIds.tenant}','HOLIDAY_CONTINUOUS','假日班','active'),
      ('${fixtureIds.overnightShift}','${fixtureIds.tenant}','OVERNIGHT_TEST','跨日測試班','active');
    insert into public.shift_segments(tenant_id,shift_id,segment_order,start_minute,end_minute) values
      ('${fixtureIds.tenant}','${fixtureIds.weekdayShift}',1,600,840),
      ('${fixtureIds.tenant}','${fixtureIds.weekdayShift}',2,960,1260),
      ('${fixtureIds.tenant}','${fixtureIds.holidayShift}',1,600,1260),
      ('${fixtureIds.tenant}','${fixtureIds.overnightShift}',1,1439,2879);
    insert into public.attendance_rule_sets(tenant_id,version,late_grace_minutes,early_leave_grace_minutes,effective_from)
      values('${fixtureIds.tenant}',1,0,0,'2026-01-01');
  `);
  await setUser(fixtureIds.admin);
}, 60_000);

afterAll(async () => { await db?.close(); });

describe("database migrations and critical workflows", () => {
  it("applies every migration to a real PostgreSQL-compatible engine", async () => {
    const result = await db.query<{ count: number }>("select count(*)::integer count from public.payroll_periods");
    expect(result.rows[0].count).toBe(0);
  });

  it("stops a continuous shift after two punches", async () => {
    await db.exec("begin");
    try {
      await setUser(fixtureIds.admin);
      const version = await db.query<{ id: string }>(`
        insert into public.schedule_versions(tenant_id,period_start,period_end,version,status,created_by)
        select $1,d,d,99,'draft',$2
        from (select (clock_timestamp() at time zone 'Asia/Taipei')::date d) dates
        returning id`, [fixtureIds.tenant, fixtureIds.admin]);
      await db.query(`insert into public.schedule_assignments(tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by)
        select $1,$2,$3,(clock_timestamp() at time zone 'Asia/Taipei')::date,$4,$5`, [
        fixtureIds.tenant, version.rows[0].id, fixtureIds.employee, fixtureIds.holidayShift, fixtureIds.admin,
      ]);
      await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
      await db.query(`insert into public.punch_records(
        tenant_id,employee_id,work_date,event_type,occurred_at,client_occurred_at,timezone,source,
        latitude,longitude,accuracy_m,location_consent_at,idempotency_key,created_by
      ) values
        ($1,$2,(clock_timestamp() at time zone 'Asia/Taipei')::date,'clock_in',clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '3 minutes','Asia/Taipei','web_gps',25.1291,121.7841,15,clock_timestamp()-interval '3 minutes',$3,$4),
        ($1,$2,(clock_timestamp() at time zone 'Asia/Taipei')::date,'clock_out',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '2 minutes','Asia/Taipei','web_gps',25.1291,121.7841,15,clock_timestamp()-interval '2 minutes',$5,$4)`, [
        fixtureIds.tenant, fixtureIds.employee, crypto.randomUUID(), fixtureIds.employeeUser, crypto.randomUUID(),
      ]);
      await setUser(fixtureIds.employeeUser);
      await expect(db.query(
        "select public.record_gps_punch($1,$2,clock_timestamp(),'Asia/Taipei',25.1291,121.7841,15,true)",
        [fixtureIds.tenant, crypto.randomUUID()],
      )).rejects.toThrow(/scheduled punch sequence complete/);
    } finally {
      await db.exec("rollback");
      await setUser(fixtureIds.admin);
    }
  });

  it("grants only selected supervisor permissions and protects permission management", async () => {
    await setUser(fixtureIds.admin);
    await db.query("select public.set_employee_admin_permissions($1,$2,$3)", [
      fixtureIds.tenant, fixtureIds.employee, ["schedule.manage", "request.manage"],
    ]);
    const access = await db.query<{ result: { account_linked: boolean; permissions: string[] } }>(
      "select public.get_employee_admin_permissions($1,$2) result",
      [fixtureIds.tenant, fixtureIds.employee],
    );
    expect(access.rows[0].result).toMatchObject({
      account_linked: true,
      permissions: ["request.manage", "schedule.manage"],
    });

    await setUser(fixtureIds.employeeUser);
    const workspace = await db.query<{
      can_manage_schedule: boolean;
      can_manage_request: boolean;
      can_manage_employee: boolean;
      can_manage_access: boolean;
    }>("select can_manage_schedule,can_manage_request,can_manage_employee,can_manage_access from public.get_current_workspace_context()");
    expect(workspace.rows[0]).toEqual({
      can_manage_schedule: true,
      can_manage_request: true,
      can_manage_employee: false,
      can_manage_access: false,
    });
    await expect(db.query("select public.set_employee_admin_permissions($1,$2,$3)", [
      fixtureIds.tenant, fixtureIds.employee, ["payroll.manage"],
    ])).rejects.toThrow(/access.manage permission required/);

    await setUser(fixtureIds.admin);
    await db.query("select public.set_employee_admin_permissions($1,$2,$3)", [fixtureIds.tenant, fixtureIds.employee, []]);
    const audit = await db.query<{ count: number }>(
      "select count(*)::integer count from public.audit_logs where entity_id=$1 and action='employee.admin_permissions_changed'",
      [fixtureIds.employee],
    );
    expect(audit.rows[0].count).toBe(2);
  });

  it("keeps unassigned days distinct from explicit days off through publication", async () => {
    await setUser(fixtureIds.admin);
    await db.query(`insert into public.holiday_calendar_entries(tenant_id,holiday_date,name,kind) values
      ($1,'2026-11-04','測試國定假日','national'),
      ($1,'2026-11-05','測試公司休假','company'),
      ($1,'2026-11-07','測試補班日','makeup_workday')`, [fixtureIds.tenant]);
    const draft = await db.query<{ id: string }>(
      "select public.create_schedule_draft($1,'2026-11-02','2026-11-08') id",
      [fixtureIds.tenant],
    );
    const defaults = await db.query<{ work_date: string; code: string }>(`
      select sa.work_date::text,s.code from public.schedule_assignments sa
      join public.shifts s on s.id=sa.shift_id
      where sa.schedule_version_id=$1 order by sa.work_date`, [draft.rows[0].id]);
    expect(defaults.rows).toEqual([
      { work_date: "2026-11-03", code: "WEEKDAY_SPLIT" },
      { work_date: "2026-11-04", code: "HOLIDAY_CONTINUOUS" },
      { work_date: "2026-11-06", code: "WEEKDAY_SPLIT" },
      { work_date: "2026-11-07", code: "WEEKDAY_SPLIT" },
      { work_date: "2026-11-08", code: "HOLIDAY_CONTINUOUS" },
    ]);
    const mondayClosure = await db.query<{ is_store_closed: boolean; shift_id: string | null }>(
      "select is_store_closed,shift_id from public.schedule_assignments where schedule_version_id=$1 and work_date='2026-11-02'",
      [draft.rows[0].id],
    );
    expect(mondayClosure.rows).toEqual([{ is_store_closed: true, shift_id: null }]);

    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant,
      draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: "2026-11-03", shift_id: null }]),
    ]);
    const remaining = await db.query<{ count: number }>(
      "select count(*)::integer count from public.schedule_assignments where schedule_version_id=$1",
      [draft.rows[0].id],
    );
    expect(remaining.rows[0].count).toBe(5);

    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant,
      draft.rows[0].id,
      JSON.stringify([
        { employee_id: fixtureIds.employee, work_date: "2026-11-02", shift_id: null, is_day_off: true },
        { employee_id: fixtureIds.employee, work_date: "2026-11-03", shift_id: null, is_day_off: true },
      ]),
    ]);
    const offRows = await db.query<{ work_date: string; is_day_off: boolean; shift_id: string | null }>(
      "select work_date::text,is_day_off,shift_id from public.schedule_assignments where schedule_version_id=$1 and is_day_off order by work_date",
      [draft.rows[0].id],
    );
    expect(offRows.rows).toEqual([
      { work_date: "2026-11-02", is_day_off: true, shift_id: null },
      { work_date: "2026-11-03", is_day_off: true, shift_id: null },
    ]);

    await expect(db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: "2026-11-06", shift_id: fixtureIds.weekdayShift, is_day_off: true }]),
    ])).rejects.toThrow(/day off cannot have a shift/);

    await expect(db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant,
      draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: "2026-11-08", shift_id: fixtureIds.weekdayShift }]),
    ])).rejects.toThrow(/shift does not match date default/);

    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, draft.rows[0].id]);
    const leaveType = await db.query<{ id: string }>(
      "insert into public.leave_types(tenant_id,code,name) values($1,'REST_DAY_TEST','排休驗證假') returning id",
      [fixtureIds.tenant],
    );
    await setUser(fixtureIds.employeeUser);
    const publishedOff = await db.query<{ work_date: string }>(
      "select work_date::text from public.get_my_published_days_off('2026-11-02','2026-11-08')",
    );
    expect(publishedOff.rows.map((row) => row.work_date)).toEqual(["2026-11-02", "2026-11-03"]);
    const publishedShifts = await db.query<{ work_date: string }>(
      "select distinct work_date::text from public.get_my_published_schedule('2026-11-02','2026-11-08') order by work_date",
    );
    expect(publishedShifts.rows.map((row) => row.work_date)).not.toContain("2026-11-03");
    await expect(db.query(
      "select public.create_work_request($1,'leave',$2,'2026-11-03 00:00','2026-11-04 00:00','測試排休請假申請',$3)",
      [fixtureIds.tenant, leaveType.rows[0].id, "10000000-0000-4000-8000-000000000030"],
    )).rejects.toThrow(/leave date requires/);
    await setUser(fixtureIds.admin);
    const run = await db.query<{ id: string }>(
      "select public.calculate_attendance_v1($1,'2026-11-02','2026-11-03') id", [fixtureIds.tenant],
    );
    const attendance = await db.query<{ count: number }>(
      "select count(*)::integer count from public.attendance_days where calculation_run_id=$1", [run.rows[0].id],
    );
    expect(attendance.rows[0].count).toBe(0);
    const nextDraft = await db.query<{ id: string }>(
      "select public.create_schedule_draft($1,'2026-11-02','2026-11-08') id", [fixtureIds.tenant],
    );
    const copiedOff = await db.query<{ count: number }>(
      "select count(*)::integer count from public.schedule_assignments where schedule_version_id=$1 and is_day_off",
      [nextDraft.rows[0].id],
    );
    expect(copiedOff.rows[0].count).toBe(2);
  });

  it("defaults Monday to store closure and permits opening or leaving it unassigned", async () => {
    await setUser(fixtureIds.admin);
    const draft = await db.query<{ id: string }>(
      "select public.create_schedule_draft($1,'2026-11-09','2026-11-15') id", [fixtureIds.tenant],
    );
    const monday = "2026-11-09";
    const readMonday = () => db.query<{ shift_id: string | null; is_store_closed: boolean }>(
      "select shift_id,is_store_closed from public.schedule_assignments where schedule_version_id=$1 and work_date=$2",
      [draft.rows[0].id, monday],
    );
    expect((await readMonday()).rows).toEqual([{ shift_id: null, is_store_closed: true }]);

    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: monday, shift_id: fixtureIds.weekdayShift }]),
    ]);
    expect((await readMonday()).rows).toEqual([{ shift_id: fixtureIds.weekdayShift, is_store_closed: false }]);

    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: monday, shift_id: null }]),
    ]);
    expect((await readMonday()).rows).toEqual([]);

    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: monday, shift_id: null, is_store_closed: true }]),
    ]);
    expect((await readMonday()).rows).toEqual([{ shift_id: null, is_store_closed: true }]);
    await expect(db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, draft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: "2026-11-10", shift_id: null, is_store_closed: true }]),
    ])).rejects.toThrow(/store closure must be a Monday/);

    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, draft.rows[0].id]);
    await setUser(fixtureIds.employeeUser);
    const closed = await db.query<{ work_date: string }>(
      "select work_date::text from public.get_my_published_store_closed('2026-11-09','2026-11-15')",
    );
    expect(closed.rows).toEqual([{ work_date: monday }]);
    const shifts = await db.query<{ work_date: string }>(
      "select distinct work_date::text from public.get_my_published_schedule('2026-11-09','2026-11-15')",
    );
    expect(shifts.rows.map((row) => row.work_date)).not.toContain(monday);

    await setUser(fixtureIds.admin);
    const run = await db.query<{ id: string }>(
      "select public.calculate_attendance_v1($1,'2026-11-09','2026-11-09') id", [fixtureIds.tenant],
    );
    const closureAttendance = await db.query<{ count: number }>(
      "select count(*)::integer count from public.attendance_days where calculation_run_id=$1", [run.rows[0].id],
    );
    expect(closureAttendance.rows[0].count).toBe(0);
    const nextDraft = await db.query<{ id: string }>(
      "select public.create_schedule_draft($1,'2026-11-09','2026-11-15') id", [fixtureIds.tenant],
    );
    const copied = await db.query<{ is_store_closed: boolean }>(
      "select is_store_closed from public.schedule_assignments where schedule_version_id=$1 and work_date=$2",
      [nextDraft.rows[0].id, monday],
    );
    expect(copied.rows).toEqual([{ is_store_closed: true }]);

    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, nextDraft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: monday, shift_id: null }]),
    ]);
    const stillUnassigned = await db.query<{ count: number }>(
      "select count(*)::integer count from public.schedule_assignments where schedule_version_id=$1 and work_date=$2",
      [nextDraft.rows[0].id, monday],
    );
    expect(stillUnassigned.rows[0].count).toBe(0);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, nextDraft.rows[0].id]);
    const revisedDraft = await db.query<{ id: string }>(
      "select public.create_schedule_draft($1,'2026-11-09','2026-11-15') id", [fixtureIds.tenant],
    );
    const newDefault = await db.query<{ is_store_closed: boolean }>(
      "select is_store_closed from public.schedule_assignments where schedule_version_id=$1 and work_date=$2",
      [revisedDraft.rows[0].id, monday],
    );
    expect(newDefault.rows).toEqual([{ is_store_closed: true }]);
    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, revisedDraft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: monday, shift_id: null }]),
    ]);
    await db.exec(readFileSync(join(migrationsDirectory, "202609230046_backfill_monday_drafts.sql"), "utf8"));
    const backfilled = await db.query<{ is_store_closed: boolean }>(
      "select is_store_closed from public.schedule_assignments where schedule_version_id=$1 and work_date=$2",
      [revisedDraft.rows[0].id, monday],
    );
    expect(backfilled.rows).toEqual([{ is_store_closed: true }]);
    const publishedUnassigned = await db.query<{ count: number }>(
      "select count(*)::integer count from public.schedule_assignments where schedule_version_id=$1 and work_date=$2",
      [nextDraft.rows[0].id, monday],
    );
    expect(publishedUnassigned.rows[0].count).toBe(0);

    await db.query(
      "insert into public.holiday_calendar_entries(tenant_id,holiday_date,name,kind) values($1,'2026-11-16','測試週一國定假日','national')",
      [fixtureIds.tenant],
    );
    const specialDraft = await db.query<{ id: string }>(
      "select public.create_schedule_draft($1,'2026-11-16','2026-11-22') id", [fixtureIds.tenant],
    );
    const specialDefault = await db.query<{ is_store_closed: boolean }>(
      "select is_store_closed from public.schedule_assignments where schedule_version_id=$1 and work_date='2026-11-16'",
      [specialDraft.rows[0].id],
    );
    expect(specialDefault.rows).toEqual([{ is_store_closed: true }]);
    await db.query("select public.save_schedule_assignments($1,$2,$3::jsonb)", [
      fixtureIds.tenant, specialDraft.rows[0].id,
      JSON.stringify([{ employee_id: fixtureIds.employee, work_date: "2026-11-16", shift_id: fixtureIds.weekdayShift }]),
    ]);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, specialDraft.rows[0].id]);
    await setUser(fixtureIds.employeeUser);
    const openedMonday = await db.query<{ work_date: string; shift_code: string }>(
      "select distinct work_date::text,shift_code from public.get_my_published_schedule('2026-11-16','2026-11-16')",
    );
    expect(openedMonday.rows).toEqual([{ work_date: "2026-11-16", shift_code: "WEEKDAY_SPLIT" }]);
  });

  it("keeps an in-progress overnight checkout on the original work date", async () => {
    await setUser(fixtureIds.admin);
    await db.query("insert into auth.users(id,email) values($1,'overnight@example.test')", [fixtureIds.overnightUser]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,status) values($1,$2,'active')", [fixtureIds.tenant, fixtureIds.overnightUser]);
    await db.query(`insert into public.employees(id,tenant_id,auth_user_id,employee_no,full_name,hire_date,status)
      values($1,$2,$3,'E002','跨日測試員工','2026-12-01','active')`, [fixtureIds.overnightEmployee, fixtureIds.tenant, fixtureIds.overnightUser]);
    await db.query(`insert into public.employee_auth_accounts(employee_id,tenant_id,auth_user_id,username,status)
      values($1,$2,$3,'overnight001','active')`, [fixtureIds.overnightEmployee, fixtureIds.tenant, fixtureIds.overnightUser]);
    await db.query(`insert into public.employment_records(tenant_id,employee_id,employment_type,hire_date,status,effective_from)
      values($1,$2,'part_time','2026-12-01','active','2026-12-01')`, [fixtureIds.tenant, fixtureIds.overnightEmployee]);
    const version = await db.query<{ id: string; work_date: string }>(`
      with dates as (select (clock_timestamp() at time zone 'Asia/Taipei')::date - 1 work_date),
      version as (
        insert into public.schedule_versions(
          tenant_id,period_start,period_end,version,status,created_by
        ) select $1,work_date,work_date,1,'draft',$2 from dates returning id,period_start
      ) select id,period_start::text work_date from version`, [fixtureIds.tenant, fixtureIds.admin]);
    await db.query(`insert into public.schedule_assignments(
      tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by
    ) values($1,$2,$3,$4,$5,$6)`, [
      fixtureIds.tenant, version.rows[0].id, fixtureIds.overnightEmployee,
      version.rows[0].work_date, fixtureIds.overnightShift, fixtureIds.admin,
    ]);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
    await db.query(`insert into public.punch_records(
      tenant_id,employee_id,work_date,event_type,occurred_at,client_occurred_at,timezone,source,
      latitude,longitude,accuracy_m,location_consent_at,idempotency_key,created_by
    ) values($1,$2,$3,'clock_in',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute',
      'Asia/Taipei','web_gps',25.1291,121.7841,15,clock_timestamp()-interval '1 minute',$4,$5)`, [
      fixtureIds.tenant, fixtureIds.overnightEmployee, version.rows[0].work_date,
      crypto.randomUUID(), fixtureIds.overnightUser,
    ]);
    await setUser(fixtureIds.overnightUser);
    const checkout = await db.query<{ id: string }>(
      "select public.record_gps_punch($1,$2,clock_timestamp(),'Asia/Taipei',25.1291,121.7841,15,true) id",
      [fixtureIds.tenant, crypto.randomUUID()],
    );
    const punch = await db.query<{ work_date: string; event_type: string }>(
      "select work_date::text,event_type::text from public.punch_records where id=$1", [checkout.rows[0].id],
    );
    expect(punch.rows[0]).toEqual({ work_date: version.rows[0].work_date, event_type: "clock_out" });
  });

  it("uses the rule effective on each work date and treats extra corrections as unmatched evidence", async () => {
    await setUser(fixtureIds.admin);
    const rule = await db.query<{ id: string }>(
      "select public.create_attendance_rule_set($1,60,60,'2026-09-09') id", [fixtureIds.tenant],
    );
    const version = await db.query<{ id: string }>(`insert into public.schedule_versions(
      tenant_id,period_start,period_end,version,status,created_by
    ) values($1,'2026-09-08','2026-09-09',1,'draft',$2) returning id`,
    [fixtureIds.tenant, fixtureIds.admin]);
    for (const date of ["2026-09-08", "2026-09-09"]) {
      await db.query(`insert into public.schedule_assignments(
        tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by
      ) values($1,$2,$3,$4,$5,$6)`, [
        fixtureIds.tenant, version.rows[0].id, fixtureIds.employee, date, fixtureIds.weekdayShift, fixtureIds.admin,
      ]);
      for (const [event, time] of [["clock_in", "10:30"], ["clock_out", "14:00"], ["clock_in", "16:00"], ["clock_out", "21:00"]]) {
        await db.query(`insert into public.punch_records(
          tenant_id,employee_id,work_date,event_type,occurred_at,client_occurred_at,timezone,source,
          latitude,longitude,accuracy_m,location_consent_at,idempotency_key,created_by
        ) values($1,$2,$3,$4,($3::date+$5::time) at time zone 'Asia/Taipei',
          ($3::date+$5::time) at time zone 'Asia/Taipei','Asia/Taipei','web_gps',25.1291,121.7841,15,
          ($3::date+$5::time) at time zone 'Asia/Taipei',$6,$7)`, [
          fixtureIds.tenant, fixtureIds.employee, date, event, time, crypto.randomUUID(), fixtureIds.employeeUser,
        ]);
      }
    }
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
    const correction = await db.query<{ id: string }>(`insert into public.punch_correction_requests(
      tenant_id,employee_id,work_date,proposed_event_type,proposed_occurred_at,timezone,reason,idempotency_key,requested_by
    ) values($1,$2,'2026-09-08','clock_in','2026-09-08 11:00'::timestamp at time zone 'Asia/Taipei',
      'Asia/Taipei','測試已存在完整卡時的額外補卡',$3,$4) returning id`, [
      fixtureIds.tenant, fixtureIds.employee, crypto.randomUUID(), fixtureIds.employeeUser,
    ]);
    await db.query(`insert into public.punch_correction_decisions(
      tenant_id,correction_request_id,decision,review_note,decided_by
    ) values($1,$2,'approved','測試核准額外補卡',$3)`, [fixtureIds.tenant, correction.rows[0].id, fixtureIds.admin]);
    await setUser(fixtureIds.admin);
    const run = await db.query<{ id: string }>("select public.calculate_attendance($1,'2026-09-08','2026-09-09') id", [fixtureIds.tenant]);
    const days = await db.query<{ work_date: string; version: number; late_minutes: number }>(`
      select ad.work_date::text,ars.version,aseg.late_minutes from public.attendance_days ad
      join public.attendance_rule_sets ars on ars.id=ad.rule_set_id
      join public.attendance_segments aseg on aseg.attendance_day_id=ad.id and aseg.segment_order=1
      where ad.calculation_run_id=$1 order by ad.work_date`, [run.rows[0].id]);
    expect(days.rows).toEqual([
      { work_date: "2026-09-08", version: 1, late_minutes: 30 },
      { work_date: "2026-09-09", version: 2, late_minutes: 0 },
    ]);
    expect(rule.rows[0].id).toBeTruthy();
    const firstSegment = await db.query<{ raw: string | null; correction: string | null; unmatched: number }>(`
      select aseg.clock_in_punch_id raw,aseg.clock_in_correction_id correction,
        (select count(*)::integer from public.attendance_exceptions ae
          where ae.attendance_day_id=ad.id and ae.exception_type='unmatched_punch') unmatched
      from public.attendance_days ad join public.attendance_segments aseg
        on aseg.attendance_day_id=ad.id and aseg.segment_order=1
      where ad.calculation_run_id=$1 and ad.work_date='2026-09-08'`, [run.rows[0].id]);
    expect(firstSegment.rows[0].raw).not.toBeNull();
    expect(firstSegment.rows[0].correction).toBeNull();
    expect(firstSegment.rows[0].unmatched).toBe(1);
  });

  it("allows leave on a special date only when a published assignment exists", async () => {
    await setUser(fixtureIds.admin);
    const version = await db.query<{ id: string }>(`insert into public.schedule_versions(
      tenant_id,period_start,period_end,version,status,created_by
    ) values($1,'2026-10-10','2026-10-10',1,'draft',$2) returning id`,
    [fixtureIds.tenant, fixtureIds.admin]);
    await db.query(`insert into public.schedule_assignments(
      tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by
    ) values($1,$2,$3,'2026-10-10',$4,$5)`, [
      fixtureIds.tenant, version.rows[0].id, fixtureIds.employee, fixtureIds.holidayShift, fixtureIds.admin,
    ]);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
    const leaveType = await db.query<{ id: string }>(
      "insert into public.leave_types(tenant_id,code,name) values($1,'SPECIAL_TEST','測試假') returning id",
      [fixtureIds.tenant],
    );
    await setUser(fixtureIds.employeeUser);
    await expect(db.query(`select public.create_work_request(
      $1,'leave',$2,'2026-10-10 10:00','2026-10-10 11:00','已發布週末班表請假測試',$3)`,
      [fixtureIds.tenant, leaveType.rows[0].id, crypto.randomUUID()])).resolves.toBeTruthy();
    await expect(db.query(`select public.create_work_request(
      $1,'leave',$2,'2026-10-17 10:00','2026-10-17 11:00','未發布週末班表請假測試',$3)`,
      [fixtureIds.tenant, leaveType.rows[0].id, crypto.randomUUID()])).rejects.toThrow(/published assignment/);
  });

  it("versions workplace settings and enforces the configured geofence", async () => {
    await setUser(fixtureIds.admin);
    await db.query("select public.save_workplace_settings($1,current_date,$2,$3,$4,$5,$6,$7,$8)", [
      fixtureIds.tenant, "測試門市", "台灣測試地址", 25.129, 121.784, 150, 100, "enforced",
    ]);
    await setUser(fixtureIds.employeeUser);
    const inside = await db.query<{ id: string }>(
      "select public.record_gps_punch($1,$2,clock_timestamp(),$3,$4,$5,$6,true) id",
      [fixtureIds.tenant, crypto.randomUUID(), "Asia/Taipei", 25.1291, 121.7841, 15],
    );
    const evidence = await db.query<{ location_verification: string; workplace_setting_version_id: string | null }>(
      "select location_verification,workplace_setting_version_id from public.punch_records where id=$1",
      [inside.rows[0].id],
    );
    expect(evidence.rows[0]).toMatchObject({ location_verification: "inside_geofence" });
    expect(evidence.rows[0].workplace_setting_version_id).not.toBeNull();

    await expect(db.query(
      `insert into public.punch_records(tenant_id,employee_id,work_date,event_type,client_occurred_at,timezone,source,latitude,longitude,accuracy_m,location_consent_at,idempotency_key,created_by)
       values($1,$2,current_date,'clock_out',clock_timestamp(),'Asia/Taipei','web_gps',24,120,10,clock_timestamp(),$3,$4)`,
      [fixtureIds.tenant, fixtureIds.employee, crypto.randomUUID(), fixtureIds.employeeUser],
    )).rejects.toThrow(/geofence rejected/);
  });

  it("runs payroll lifecycle, preserves adjustments, and exposes only locked self data", async () => {
    await setUser(fixtureIds.admin);
    await db.query("select public.save_payroll_settings($1,$2,25,5,1,'monthly',$3)", [fixtureIds.tenant, "2026-01-01", "測試規則"]);
    await db.query(`select public.save_payroll_statutory_settings(
      $1,$2,115000,200000,10000,200000,51700,300000,60000,240,
      120,1333333,120,1666667,0,2000000,$3)`, [fixtureIds.tenant, "2026-01-01", "測試用法定費率與平日加班級距"]);
    await db.query("select public.save_employee_compensation($1,$2,$3,'monthly',3600000,$4)", [fixtureIds.tenant, fixtureIds.employee, "2026-01-01", "月薪 36,000"]);
    await db.query(`select public.save_employee_statutory_profile(
      $1,$2,$3,3600000,3600000,3600000,0,3600000,0,0,$4)`,
      [fixtureIds.tenant, fixtureIds.employee, "2026-01-01", "測試員工投保級距"]);
    await db.query("insert into public.leave_types(tenant_id,code,name) values($1,'PERSONAL','事假')", [fixtureIds.tenant]);
    const leaveType = await db.query<{ id: string }>("select id from public.leave_types where tenant_id=$1 and code='PERSONAL'", [fixtureIds.tenant]);
    await db.query("select public.save_leave_pay_rule($1,$2,$3,0,$4)", [fixtureIds.tenant, leaveType.rows[0].id, "2026-01-01", "事假測試設定為不給薪"]);
    await setUser(fixtureIds.employeeUser);
    const leaveRequest = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'leave',$2,'2026-09-08 10:00','2026-09-08 12:00','薪資連動測試請假',$3) id`,
      [fixtureIds.tenant, leaveType.rows[0].id, crypto.randomUUID()]);
    const overtimeRequest = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'overtime',null,'2026-09-09 21:00','2026-09-09 23:00','薪資連動測試加班',$2) id`,
      [fixtureIds.tenant, crypto.randomUUID()]);
    await setUser(fixtureIds.admin);
    await db.query("select public.decide_work_request($1,$2,'approved','薪資整合測試核准')", [fixtureIds.tenant, leaveRequest.rows[0].id]);
    await db.query("select public.decide_work_request($1,$2,'approved','薪資整合測試核准')", [fixtureIds.tenant, overtimeRequest.rows[0].id]);
    const period = await db.query<{ id: string }>("select public.create_payroll_period($1,$2,null) id", [fixtureIds.tenant, "2026-09-01"]);
    const periodId = period.rows[0].id;
    await db.query("select public.calculate_payroll_draft($1,$2)", [fixtureIds.tenant, periodId]);
    const entry = await db.query<{ id: string }>("select id from public.payroll_entries where payroll_period_id=$1", [periodId]);
    const adjustmentKey = crypto.randomUUID();
    await db.query("select public.add_payroll_adjustment_once($1,$2,'earning','測試津貼',10000,$3,$4)", [fixtureIds.tenant, entry.rows[0].id, "保留人工調整", adjustmentKey]);
    await db.query("select public.calculate_payroll_draft($1,$2)", [fixtureIds.tenant, periodId]);
    const totals = await db.query<{ gross_cents: number; deduction_cents: number; manual_items: number }>(
      `select pe.gross_cents,pe.deduction_cents,(select count(*)::integer from public.payroll_items pi where pi.payroll_entry_id=pe.id and pi.source='manual') manual_items
       from public.payroll_entries pe where pe.id=$1`, [entry.rows[0].id],
    );
    expect(totals.rows[0]).toEqual({ gross_cents: 3_650_000, deduction_cents: 175_800, manual_items: 1 });
    const linkedItems = await db.query<{ code: string; amount_cents: number }>(
      "select code,amount_cents from public.payroll_items where payroll_entry_id=$1 and code in ('OVERTIME','UNPAID_LEAVE','LABOR_INSURANCE','EMPLOYMENT_INSURANCE','HEALTH_INSURANCE') order by code",
      [entry.rows[0].id],
    );
    expect(linkedItems.rows).toEqual([
      { code: "EMPLOYMENT_INSURANCE", amount_cents: 7_200 },
      { code: "HEALTH_INSURANCE", amount_cents: 55_800 },
      { code: "LABOR_INSURANCE", amount_cents: 82_800 },
      { code: "OVERTIME", amount_cents: 40_000 },
      { code: "UNPAID_LEAVE", amount_cents: 30_000 },
    ]);
    await db.query("select public.review_payroll_period($1,$2,$3)", [fixtureIds.tenant, periodId, "已逐筆核對薪資設定與人工調整"]);
    await db.query("select public.set_payroll_period_status($1,$2,'locked')", [fixtureIds.tenant, periodId]);
    await expect(db.query("select public.add_payroll_adjustment($1,$2,'earning','鎖定後修改',1,'')", [fixtureIds.tenant, entry.rows[0].id])).rejects.toThrow();

    await db.exec("set role authenticated");
    await setUser(fixtureIds.employeeUser);
    const employeeRows = await db.query<{ count: number }>("select count(*)::integer count from public.payroll_entries");
    expect(employeeRows.rows[0].count).toBe(1);
    const employeeNotifications = await db.query<{ title: string }>("select title from public.notifications where recipient_user_id=$1", [fixtureIds.employeeUser]);
    expect(employeeNotifications.rows.map((row) => row.title)).toEqual(expect.arrayContaining(["申請已核准", "薪資單已發布"]));
    await setUser(fixtureIds.outsider);
    const outsiderRows = await db.query<{ count: number }>("select count(*)::integer count from public.payroll_entries");
    expect(outsiderRows.rows[0].count).toBe(0);
    await db.exec("reset role");
  });

  it("blocks hourly payroll review until scheduled work dates have attendance snapshots", async () => {
    await setUser(fixtureIds.admin);
    await db.query("select public.save_employee_compensation($1,$2,'2026-01-01','hourly',20000,'時薪測試')", [
      fixtureIds.tenant, fixtureIds.overnightEmployee,
    ]);
    await db.query(`select public.save_employee_statutory_profile(
      $1,$2,'2026-01-01',3000000,3000000,3000000,0,3000000,0,0,'時薪投保測試')`, [
      fixtureIds.tenant, fixtureIds.overnightEmployee,
    ]);
    const version = await db.query<{ id: string }>(`insert into public.schedule_versions(
      tenant_id,period_start,period_end,version,status,created_by
    ) values($1,'2026-12-08','2026-12-08',1,'draft',$2) returning id`,
    [fixtureIds.tenant, fixtureIds.admin]);
    await db.query(`insert into public.schedule_assignments(
      tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by
    ) values($1,$2,$3,'2026-12-08',$4,$5)`, [
      fixtureIds.tenant, version.rows[0].id, fixtureIds.overnightEmployee, fixtureIds.weekdayShift, fixtureIds.admin,
    ]);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
    const period = await db.query<{ id: string }>(
      "select public.create_payroll_period($1,'2026-12-01',null) id", [fixtureIds.tenant],
    );
    await db.query("select public.calculate_payroll_draft($1,$2)", [fixtureIds.tenant, period.rows[0].id]);
    await expect(db.query("select public.review_payroll_period($1,$2,'已檢查時薪員工本期資料完整性')", [
      fixtureIds.tenant, period.rows[0].id,
    ])).rejects.toThrow(/missing attendance calculations/);
  });

  it("grants statutory annual leave by anniversary and deducts approved requests", async () => {
    await setUser(fixtureIds.admin);
    await db.query(
      "insert into public.leave_types(tenant_id,code,name) values($1,'ANNUAL','特別休假') on conflict(tenant_id,code) do nothing",
      [fixtureIds.tenant],
    );
    const policy = await db.query<{ id: string }>(
      "select public.save_annual_leave_policy($1,$2,480,$3) id",
      [fixtureIds.tenant, "2026-01-01", "勞動基準法第 38 條週年制測試"],
    );
    await expect(db.query(
      "update public.annual_leave_policy_versions set standard_day_minutes=420 where id=$1",
      [policy.rows[0].id],
    )).rejects.toThrow(/immutable/);

    await setUser(fixtureIds.employeeUser);
    const initial = await db.query<{ balance: { configured: boolean; available_minutes: number; standard_day_minutes: number } }>(
      "select public.get_my_annual_leave_balance($1) balance",
      ["2026-09-21"],
    );
    expect(initial.rows[0].balance).toMatchObject({ configured: true, available_minutes: 1_440, standard_day_minutes: 480 });

    const request = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'leave',(select id from public.leave_types where tenant_id=$1 and code='ANNUAL'),
      '2026-09-22 10:00','2026-09-22 12:00','法定特休扣抵測試',$2) id`,
      [fixtureIds.tenant, crypto.randomUUID()]);
    await setUser(fixtureIds.admin);
    await db.query("select public.decide_work_request($1,$2,'approved','核准特休測試')", [fixtureIds.tenant, request.rows[0].id]);
    const afterApproval = await db.query<{ balance: { available_minutes: number; used_minutes: number } }>(
      "select public.get_annual_leave_balance($1,$2,$3) balance",
      [fixtureIds.tenant, fixtureIds.employee, "2026-09-22"],
    );
    expect(afterApproval.rows[0].balance).toMatchObject({ available_minutes: 1_320, used_minutes: 120 });

    await setUser(fixtureIds.employeeUser);
    const excessive = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'leave',(select id from public.leave_types where tenant_id=$1 and code='ANNUAL'),
      '2026-09-24 00:00','2026-09-24 23:59','超過法定特休餘額測試',$2) id`,
      [fixtureIds.tenant, crypto.randomUUID()]);
    await setUser(fixtureIds.admin);
    await expect(db.query(
      "select public.decide_work_request($1,$2,'approved','應阻擋超額核准')",
      [fixtureIds.tenant, excessive.rows[0].id],
    )).rejects.toThrow(/insufficient annual leave balance/);

    const anniversary = await db.query<{ balance: { available_minutes: number; used_minutes: number; grants: Array<{ service_milestone_months: number; settlement_status: string }> } }>(
      "select public.get_annual_leave_balance($1,$2,$3) balance",
      [fixtureIds.tenant, fixtureIds.employee, "2027-01-01"],
    );
    expect(anniversary.rows[0].balance).toMatchObject({ available_minutes: 3_360, used_minutes: 0 });
    expect(anniversary.rows[0].balance.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({ service_milestone_months: 6, settlement_status: "pending" }),
      expect.objectContaining({ service_milestone_months: 12, settlement_status: "not_due" }),
    ]));
  });

  it("charges full-day leave as one standard workday while keeping timed leave hourly", async () => {
    await setUser(fixtureIds.employeeUser);
    const leaveType = await db.query<{ id: string }>(
      "select id from public.leave_types where tenant_id=$1 and code='ANNUAL'", [fixtureIds.tenant],
    );
    const fullDay = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'leave',$2,'2026-09-25 00:00','2026-09-26 00:00','整日特休扣抵測試',$3) id`,
      [fixtureIds.tenant, leaveType.rows[0].id, crypto.randomUUID()]);
    const timed = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'leave',$2,'2026-09-29 10:00','2026-09-29 12:00','指定時段特休測試',$3) id`,
      [fixtureIds.tenant, leaveType.rows[0].id, crypto.randomUUID()]);
    const amounts = await db.query<{ id: string; requested_minutes: number }>(
      "select id,requested_minutes from public.work_requests where id in ($1,$2)",
      [fullDay.rows[0].id, timed.rows[0].id],
    );
    expect(new Map(amounts.rows.map((row) => [row.id, row.requested_minutes]))).toEqual(new Map([
      [fullDay.rows[0].id, 480], [timed.rows[0].id, 120],
    ]));
    await setUser(fixtureIds.admin);
    await db.query("select public.decide_work_request($1,$2,'approved','核准整日特休')", [fixtureIds.tenant, fullDay.rows[0].id]);
    const usage = await db.query<{ used_minutes: number }>(
      "select used_minutes from public.annual_leave_usages where work_request_id=$1", [fullDay.rows[0].id],
    );
    expect(usage.rows.reduce((total, row) => total + row.used_minutes, 0)).toBe(480);
  });

  it("covers every segment of an overnight shift with full-day leave", async () => {
    await setUser(fixtureIds.admin);
    const version = await db.query<{ id: string }>(`insert into public.schedule_versions(
      tenant_id,period_start,period_end,version,status,created_by
    ) values($1,'2026-12-15','2026-12-15',1,'draft',$2) returning id`,
    [fixtureIds.tenant, fixtureIds.admin]);
    await db.query(`insert into public.schedule_assignments(
      tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by
    ) values($1,$2,$3,'2026-12-15',$4,$5)`, [
      fixtureIds.tenant, version.rows[0].id, fixtureIds.overnightEmployee, fixtureIds.overnightShift, fixtureIds.admin,
    ]);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
    const leaveType = await db.query<{ id: string }>(
      "select id from public.leave_types where tenant_id=$1 and code='PERSONAL'", [fixtureIds.tenant],
    );
    await setUser(fixtureIds.overnightUser);
    const request = await db.query<{ id: string }>(`select public.create_work_request(
      $1,'leave',$2,'2026-12-15 00:00','2026-12-16 00:00','跨午夜班整日請假測試',$3) id`,
      [fixtureIds.tenant, leaveType.rows[0].id, crypto.randomUUID()]);
    await setUser(fixtureIds.admin);
    await db.query("select public.decide_work_request($1,$2,'approved','核准整日請假')", [fixtureIds.tenant, request.rows[0].id]);
    const run = await db.query<{ id: string }>(
      "select public.calculate_attendance($1,'2026-12-15','2026-12-15') id", [fixtureIds.tenant],
    );
    const day = await db.query<{ status: string; scheduled_minutes: number; approved_leave_minutes: number }>(
      "select status,scheduled_minutes,approved_leave_minutes from public.attendance_days where calculation_run_id=$1 and employee_id=$2 and work_date='2026-12-15'",
      [run.rows[0].id, fixtureIds.overnightEmployee],
    );
    expect(day.rows[0]).toMatchObject({ status: "leave", scheduled_minutes: 1440, approved_leave_minutes: 1440 });
  });

  it("lets only admins delete selected punches while preserving evidence and recalculating attendance", async () => {
    await setUser(fixtureIds.admin);
    const version = await db.query<{ id: string }>(`insert into public.schedule_versions(
      tenant_id,period_start,period_end,version,status,created_by
    ) values($1,'2026-12-22','2026-12-22',1,'draft',$2) returning id`,
    [fixtureIds.tenant, fixtureIds.admin]);
    await db.query(`insert into public.schedule_assignments(
      tenant_id,schedule_version_id,employee_id,work_date,shift_id,created_by
    ) values($1,$2,$3,'2026-12-22',$4,$5)`, [
      fixtureIds.tenant, version.rows[0].id, fixtureIds.employee, fixtureIds.weekdayShift, fixtureIds.admin,
    ]);
    await db.query("select public.publish_schedule($1,$2)", [fixtureIds.tenant, version.rows[0].id]);
    const punches = await db.query<{ id: string }>(`insert into public.punch_records(
      tenant_id,employee_id,work_date,event_type,occurred_at,client_occurred_at,timezone,source,
      idempotency_key,created_by
    ) values
      ($1,$2,'2026-12-22','clock_in','2026-12-22 10:00+08','2026-12-22 10:00+08','Asia/Taipei','qr',$3,$4),
      ($1,$2,'2026-12-22','clock_out','2026-12-22 14:00+08','2026-12-22 14:00+08','Asia/Taipei','qr',$5,$4)
    returning id`, [fixtureIds.tenant, fixtureIds.employee, crypto.randomUUID(), fixtureIds.employeeUser, crypto.randomUUID()]);
    const ids = punches.rows.map((row) => row.id);
    const firstRun = await db.query<{ id: string }>(
      "select public.calculate_attendance($1,'2026-12-22','2026-12-22') id", [fixtureIds.tenant]);
    const oldSegments = await db.query<{ count: number }>(`select count(*)::integer count
      from public.attendance_segments where attendance_day_id in
      (select id from public.attendance_days where calculation_run_id=$1)
      and (clock_in_punch_id=any($2::uuid[]) or clock_out_punch_id=any($2::uuid[]))`, [firstRun.rows[0].id, ids]);
    expect(oldSegments.rows[0].count).toBeGreaterThan(0);

    await setUser(fixtureIds.employeeUser);
    await expect(db.query("select public.void_punch_records($1,$2::uuid[],$3)", [fixtureIds.tenant, ids, "測試錯誤打卡刪除"])).rejects.toThrow(/attendance.punch_delete permission required/);
    await setUser(fixtureIds.admin);
    await expect(db.query("select public.void_punch_records($1,$2::uuid[],$3)", [fixtureIds.tenant, [ids[0], ids[0]], "測試重複選取"])).rejects.toThrow(/distinct punch records/);
    const deleted = await db.query<{ count: number }>("select public.void_punch_records($1,$2::uuid[],$3) count", [fixtureIds.tenant, ids, "測試錯誤打卡刪除"]);
    expect(deleted.rows[0].count).toBe(2);
    const retained = await db.query<{ count: number; deleted: number; actor: string }>(`select
      count(*)::integer count, count(*) filter(where voided_at is not null)::integer deleted,
      min(voided_by::text) actor from public.punch_records where id=any($1::uuid[])`, [ids]);
    expect(retained.rows[0]).toEqual({ count: 2, deleted: 2, actor: fixtureIds.admin });
    const active = await db.query<{ count: number }>(
      "select count(*)::integer count from public.active_punch_records where id=any($1::uuid[])", [ids]);
    expect(active.rows[0].count).toBe(0);
    await expect(db.query("delete from public.punch_records where id=$1", [ids[0]])).rejects.toThrow(/append-only/);
    const stale = await db.query<{ work_date: string }>(
      "select work_date::text from public.get_stale_voided_punch_dates($1)", [fixtureIds.tenant]);
    expect(stale.rows.some((row) => row.work_date === "2026-12-22")).toBe(true);
    const nextRun = await db.query<{ id: string }>(
      "select public.calculate_attendance($1,'2026-12-22','2026-12-22') id", [fixtureIds.tenant]);
    const nextSegments = await db.query<{ count: number }>(`select count(*)::integer count
      from public.attendance_segments where attendance_day_id in
      (select id from public.attendance_days where calculation_run_id=$1)
      and (clock_in_punch_id is not null or clock_out_punch_id is not null)`, [nextRun.rows[0].id]);
    expect(nextSegments.rows[0].count).toBe(0);
    const audit = await db.query<{ count: number }>(`select count(*)::integer count
      from public.audit_logs where tenant_id=$1 and action='punch.records_voided' and after_data->>'count'='2'`, [fixtureIds.tenant]);
    expect(audit.rows[0].count).toBe(1);
    const cleared = await db.query<{ work_date: string }>(
      "select work_date::text from public.get_stale_voided_punch_dates($1)", [fixtureIds.tenant]);
    expect(cleared.rows.some((row) => row.work_date === "2026-12-22")).toBe(false);
  });

  it("restricts audit history and rate-limits abnormal punch bursts", async () => {
    await setUser(fixtureIds.admin);
    await db.query("select public.record_self_password_change($1)", [fixtureIds.tenant]);
    const audit = await db.query<{ action: string }>("select action from public.get_audit_log_page($1,100,null)", [fixtureIds.tenant]);
    expect(audit.rows.some((row) => row.action === "payroll.status_changed")).toBe(true);
    expect(audit.rows.some((row) => row.action === "auth.password_changed")).toBe(true);
    await setUser(fixtureIds.employeeUser);
    await expect(db.query("select public.record_self_password_change($1)", [fixtureIds.tenant])).rejects.toThrow(/administrator membership required/);
    await expect(db.query("select * from public.get_audit_log_page($1,100,null)", [fixtureIds.tenant])).rejects.toThrow(/security.audit permission required/);

    const recentPunches = await db.query<{ count: number }>(
      "select count(*)::integer count from public.punch_records where tenant_id=$1 and employee_id=$2 and created_at>clock_timestamp()-interval '10 minutes'",
      [fixtureIds.tenant, fixtureIds.employee],
    );
    for (let index = recentPunches.rows[0].count; index < 20; index += 1) {
      await db.query(
        `insert into public.punch_records(tenant_id,employee_id,work_date,event_type,client_occurred_at,timezone,source,idempotency_key,created_by)
         values($1,$2,current_date,'clock_in',clock_timestamp(),'Asia/Taipei','qr',$3,$4)`,
        [fixtureIds.tenant, fixtureIds.employee, crypto.randomUUID(), fixtureIds.employeeUser],
      );
    }
    await expect(db.query(
      `insert into public.punch_records(tenant_id,employee_id,work_date,event_type,client_occurred_at,timezone,source,idempotency_key,created_by)
       values($1,$2,current_date,'clock_in',clock_timestamp(),'Asia/Taipei','qr',$3,$4)`,
      [fixtureIds.tenant, fixtureIds.employee, crypto.randomUUID(), fixtureIds.employeeUser],
    )).rejects.toThrow(/punch rate limit exceeded/);
  });

  it("archives employees and only permanently deletes records without retained history", async () => {
    const cleanUser = "10000000-0000-4000-8000-000000000008";
    const cleanEmployee = "10000000-0000-4000-8000-000000000009";
    await db.query("insert into auth.users(id,email) values($1,$2)", [cleanUser, "clean-employee@example.test"]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,status) values($1,$2,'active')", [fixtureIds.tenant, cleanUser]);
    await db.query(`insert into public.employees(id,tenant_id,auth_user_id,employee_no,full_name,hire_date,status)
      values($1,$2,$3,'E-CLEAN','誤建員工','2026-09-01','active')`, [cleanEmployee, fixtureIds.tenant, cleanUser]);
    await db.query("insert into public.employee_profiles(employee_id,tenant_id) values($1,$2)", [cleanEmployee, fixtureIds.tenant]);
    await db.query("insert into public.employee_contacts(employee_id,tenant_id) values($1,$2)", [cleanEmployee, fixtureIds.tenant]);
    await db.query(`insert into public.employment_records(tenant_id,employee_id,employment_type,hire_date,status,effective_from)
      values($1,$2,'full_time','2026-09-01','active','2026-09-01')`, [fixtureIds.tenant, cleanEmployee]);
    await db.query(`insert into public.employee_auth_accounts(employee_id,tenant_id,auth_user_id,username)
      values($1,$2,$3,'clean_employee')`, [cleanEmployee, fixtureIds.tenant, cleanUser]);

    await setUser(fixtureIds.admin);
    await db.query("select public.archive_employee($1,$2,$3)", [fixtureIds.tenant, cleanEmployee, "整合測試誤建員工封存"]);
    const archived = await db.query<{ status: string; archived: boolean; account_status: string; membership_status: string }>(`
      select e.status,e.archived_at is not null archived,eaa.status account_status,tm.status membership_status
      from public.employees e join public.employee_auth_accounts eaa on eaa.employee_id=e.id
      join public.tenant_memberships tm on tm.tenant_id=e.tenant_id and tm.user_id=e.auth_user_id
      where e.id=$1`, [cleanEmployee]);
    expect(archived.rows[0]).toEqual({ status: "terminated", archived: true, account_status: "suspended", membership_status: "suspended" });
    const eligible = await db.query<{ result: { eligible: boolean; blockers: string[] } }>(
      "select public.get_employee_deletion_eligibility($1,$2) result", [fixtureIds.tenant, cleanEmployee],
    );
    expect(eligible.rows[0].result).toMatchObject({ eligible: true, blockers: [] });
    await db.query("select public.delete_unreferenced_employee($1,$2)", [fixtureIds.tenant, cleanEmployee]);
    const deleted = await db.query<{ count: number }>("select count(*)::integer count from public.employees where id=$1", [cleanEmployee]);
    expect(deleted.rows[0].count).toBe(0);
    const revoked = await db.query<{ status: string }>("select status from public.tenant_memberships where tenant_id=$1 and user_id=$2", [fixtureIds.tenant, cleanUser]);
    expect(revoked.rows[0].status).toBe("revoked");

    const retained = await db.query<{ result: { eligible: boolean; blockers: string[] } }>(
      "select public.get_employee_deletion_eligibility($1,$2) result", [fixtureIds.tenant, fixtureIds.employee],
    );
    expect(retained.rows[0].result.eligible).toBe(false);
    expect(retained.rows[0].result.blockers).toEqual(expect.arrayContaining(["打卡紀錄", "薪資紀錄", "特休台帳"]));
  });
});
