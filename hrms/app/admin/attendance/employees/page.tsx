import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getAdminContext } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMonthBounds, taipeiDateKey, formatTaipeiDateTime } from "@/lib/schedule-display";
import { punchActionLabels, punchActionSchema } from "@/lib/punch-flow";
import { punchEventLabels, punchSourceLabels, locationVerificationLabels } from "@/lib/punch-contract";
import type { PunchRecord } from "@/lib/punches";

export const dynamic = "force-dynamic";

const weekday = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", weekday: "short" });

export default async function EmployeeAttendancePage({ searchParams }: {
  searchParams: Promise<{ employee?: string; month?: string }>;
}) {
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");
  const params = await searchParams;
  const today = taipeiDateKey();
  const month = typeof params.month === "string" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(params.month)
    ? params.month : today.slice(0, 7);
  const { dateFrom, dateTo } = getMonthBounds(`${month}-01`);
  const supabase = await createSupabaseServerClient();
  // Include former employees so historical months remain accessible.
  const employeesResult = await supabase.from("employees").select("id, employee_no, full_name")
    .eq("tenant_id", admin.tenantId).order("employee_no");
  const employees = employeesResult.data ?? [];
  const selected = params.employee ? employees.find((employee) => employee.id === params.employee) : employees[0];
  const punches: PunchRecord[] = [];
  let failed = Boolean(employeesResult.error);
  if (selected) {
    // Page through the evidence rather than silently truncating a busy month.
    for (let offset = 0; ; offset += 500) {
      const result = await supabase.from("punch_records").select("*")
        .eq("tenant_id", admin.tenantId).eq("employee_id", selected.id)
        .gte("work_date", dateFrom).lte("work_date", dateTo).is("voided_at", null)
        .order("occurred_at").order("id").range(offset, offset + 499);
      if (result.error) { failed = true; break; }
      punches.push(...result.data);
      if (result.data.length < 500) break;
    }
  }
  const grouped = new Map<string, PunchRecord[]>();
  for (const punch of punches) grouped.set(punch.work_date, [...(grouped.get(punch.work_date) ?? []), punch]);
  const dates = Array.from({ length: Number(dateTo.slice(-2)) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  return <>
    <header className="admin-page-header"><div><span className="admin-eyebrow">EMPLOYEE ATTENDANCE</span><h1>個別員工打卡紀錄</h1><p>選擇員工與月份，依工作日查看整個月的詳細打卡資訊。</p></div><Link className="admin-back-link" href="/admin/attendance">返回打卡紀錄</Link></header>
    <section className="admin-panel employee-attendance-filter">
      <form action="/admin/attendance/employees" key={`${selected?.id}-${month}`}>
        <label>員工<select name="employee" defaultValue={selected?.id ?? ""} required><option value="" disabled>請選擇員工</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no} · {employee.full_name}</option>)}</select></label>
        <label>月份<input name="month" type="month" defaultValue={month} min="1000-01" max="9999-12" required /></label>
        <button className="admin-button" type="submit">查詢紀錄</button>
      </form>
    </section>
    {failed ? <div className="admin-form-error" role="alert">打卡資料讀取失敗，請重新查詢。</div> : !selected ? <div className="admin-empty"><CalendarDays size={28} /><strong>{employees.length ? "請選擇有效的員工" : "目前沒有員工資料"}</strong></div> : <>
      <section className="attendance-detail-stats"><article><small>查詢員工</small><strong>{selected.full_name}</strong><small>{selected.employee_no}</small></article><article><small>{month} 有打卡天數</small><strong>{grouped.size} 天</strong></article><article><small>打卡總筆數</small><strong>{punches.length} 筆</strong></article></section>
      <section className="admin-panel attendance-detail-panel"><header><div><h2>{selected.full_name} · {month} 每日明細</h2><p>依打卡所屬工作日排列；跨日打卡會顯示實際日期。未打卡不代表缺勤，仍需對照班表與請假。</p><small>顯示有效原始打卡；補卡申請與計算結果請至「打卡紀錄」查看。</small></div></header>
        <div className="employee-attendance-days">{dates.map((date) => {
          const records = grouped.get(date) ?? [];
          return <article className="employee-attendance-day" key={date}>
            <header><strong>{date.slice(5)} {weekday.format(new Date(`${date}T00:00:00+08:00`))}</strong><small>{records.length ? `${records.length} 筆打卡` : date > today ? "尚未到日" : "無打卡紀錄"}</small></header>
            <div>{records.length ? records.map((record) => {
              const action = punchActionSchema.safeParse(record.punch_action);
              return <div className="employee-attendance-punch" key={record.id}>
                <span className={`attendance-event ${record.event_type}`}>{action.success ? punchActionLabels[action.data] : punchEventLabels[record.event_type]}</span>
                <div><strong>{formatTaipeiDateTime(record.occurred_at)}</strong>{record.starts_afternoon_meal ? <small className="auto-afternoon-meal-note">自動開始下午吃飯 · 預計 30 分鐘</small> : null}</div>
                <small>{punchSourceLabels[record.source]} · {record.source === "qr" ? "授權機器驗證" : locationVerificationLabels[record.location_verification]}{record.source === "web_gps" && record.accuracy_m != null ? ` · GPS 誤差約 ${Math.round(Number(record.accuracy_m))} 公尺` : ""}</small>
              </div>;
            }) : <p className="employee-attendance-empty">{date > today ? "—" : "當日沒有有效原始打卡"}</p>}</div>
          </article>;
        })}</div>
      </section>
    </>}
  </>;
}
