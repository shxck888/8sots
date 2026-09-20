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
    insert into public.employment_records(tenant_id,employee_id,employment_type,hire_date,status,effective_from)
      values('${fixtureIds.tenant}','${fixtureIds.employee}','full_time','2026-01-01','active','2026-01-01');
  `);
  await setUser(fixtureIds.admin);
}, 60_000);

afterAll(async () => { await db?.close(); });

describe("database migrations and critical workflows", () => {
  it("applies every migration to a real PostgreSQL-compatible engine", async () => {
    const result = await db.query<{ count: number }>("select count(*)::integer count from public.payroll_periods");
    expect(result.rows[0].count).toBe(0);
  });

  it("versions workplace settings and enforces the configured geofence", async () => {
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
    await db.query("select public.save_employee_compensation($1,$2,$3,'monthly',3600000,$4)", [fixtureIds.tenant, fixtureIds.employee, "2026-01-01", "月薪 36,000"]);
    const period = await db.query<{ id: string }>("select public.create_payroll_period($1,$2,null) id", [fixtureIds.tenant, "2026-09-01"]);
    const periodId = period.rows[0].id;
    await db.query("select public.calculate_payroll_draft($1,$2)", [fixtureIds.tenant, periodId]);
    const entry = await db.query<{ id: string }>("select id from public.payroll_entries where payroll_period_id=$1", [periodId]);
    const adjustmentKey = crypto.randomUUID();
    await db.query("select public.add_payroll_adjustment_once($1,$2,'earning','測試津貼',10000,$3,$4)", [fixtureIds.tenant, entry.rows[0].id, "保留人工調整", adjustmentKey]);
    await db.query("select public.calculate_payroll_draft($1,$2)", [fixtureIds.tenant, periodId]);
    const totals = await db.query<{ gross_cents: number; manual_items: number }>(
      `select pe.gross_cents,(select count(*)::integer from public.payroll_items pi where pi.payroll_entry_id=pe.id and pi.source='manual') manual_items
       from public.payroll_entries pe where pe.id=$1`, [entry.rows[0].id],
    );
    expect(totals.rows[0]).toEqual({ gross_cents: 3_610_000, manual_items: 1 });
    await db.query("select public.review_payroll_period($1,$2,$3)", [fixtureIds.tenant, periodId, "已逐筆核對薪資設定與人工調整"]);
    await db.query("select public.set_payroll_period_status($1,$2,'locked')", [fixtureIds.tenant, periodId]);
    await expect(db.query("select public.add_payroll_adjustment($1,$2,'earning','鎖定後修改',1,'')", [fixtureIds.tenant, entry.rows[0].id])).rejects.toThrow();

    await db.exec("set role authenticated");
    await setUser(fixtureIds.employeeUser);
    const employeeRows = await db.query<{ count: number }>("select count(*)::integer count from public.payroll_entries");
    expect(employeeRows.rows[0].count).toBe(1);
    await setUser(fixtureIds.outsider);
    const outsiderRows = await db.query<{ count: number }>("select count(*)::integer count from public.payroll_entries");
    expect(outsiderRows.rows[0].count).toBe(0);
    await db.exec("reset role");
  });

  it("restricts audit history and rate-limits abnormal punch bursts", async () => {
    await setUser(fixtureIds.admin);
    const audit = await db.query<{ action: string }>("select action from public.get_audit_log_page($1,100,null)", [fixtureIds.tenant]);
    expect(audit.rows.some((row) => row.action === "payroll.status_changed")).toBe(true);
    await setUser(fixtureIds.employeeUser);
    await expect(db.query("select * from public.get_audit_log_page($1,100,null)", [fixtureIds.tenant])).rejects.toThrow(/security.audit permission required/);

    for (let index = 0; index < 19; index += 1) {
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
});
