import { CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import {
  HOLIDAY_KINDS,
  holidayKindLabels,
  holidayYear,
  holidayYearBounds,
} from "@/lib/holidays";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteHoliday, upsertHoliday } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  input: "假日內容格式不正確，請重新輸入。",
  permission: "你沒有維護假日曆的權限。",
  missing: "找不到該筆假日，請重新整理。",
  save: "假日儲存失敗，請稍後再試。",
};

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long", day: "numeric", weekday: "short", timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

export default async function HolidaysPage({ searchParams }: {
  searchParams: Promise<{
    year?: string; saved?: string; deleted?: string; error?: string;
  }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext("schedule.manage");
  if (!admin) redirect("/");

  const year = holidayYear(params.year);
  const { start, end } = holidayYearBounds(year);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("holiday_calendar_entries")
    .select("id, holiday_date, name, kind, note")
    .eq("tenant_id", admin.tenantId)
    .gte("holiday_date", start)
    .lte("holiday_date", end)
    .order("holiday_date");
  const holidays = data ?? [];

  return (
    <>
      <header className="admin-page-header schedule-header">
        <div>
          <span className="admin-eyebrow">HOLIDAYS</span>
          <h1>假日曆</h1>
          <p>維護國定假日、公司休假與補班日；發布班表前會依此提示排班是否落在假日。</p>
        </div>
        <div className="schedule-week-nav">
          <Link aria-label="前一年" href={`/admin/holidays?year=${year - 1}`}><ChevronLeft size={17} /></Link>
          <strong>{year} 年</strong>
          <Link aria-label="後一年" href={`/admin/holidays?year=${year + 1}`}><ChevronRight size={17} /></Link>
        </div>
      </header>

      {params.saved ? <div className="admin-success">假日已儲存。</div> : null}
      {params.deleted ? <div className="admin-success">假日已刪除。</div> : null}
      {params.error ? <div className="admin-form-error schedule-message">{errorMessages[params.error] ?? errorMessages.save}</div> : null}

      <section className="admin-panel">
        <form action={upsertHoliday} className="holiday-form">
          <div className="holiday-form-field">
            <label htmlFor="holidayDate">日期</label>
            <input id="holidayDate" name="holidayDate" type="date" defaultValue={`${year}-01-01`} required min={start} max={end} />
          </div>
          <div className="holiday-form-field">
            <label htmlFor="name">名稱</label>
            <input id="name" name="name" type="text" maxLength={80} placeholder="例如：國慶日" required />
          </div>
          <div className="holiday-form-field">
            <label htmlFor="kind">類型</label>
            <select id="kind" name="kind" defaultValue="national">
              {HOLIDAY_KINDS.map((kind) => (
                <option key={kind} value={kind}>{holidayKindLabels[kind]}</option>
              ))}
            </select>
          </div>
          <div className="holiday-form-field holiday-form-note">
            <label htmlFor="note">備註（選填）</label>
            <input id="note" name="note" type="text" maxLength={300} placeholder="選填說明" />
          </div>
          <button className="admin-button primary" type="submit"><CalendarPlus size={16} /> 新增／更新</button>
        </form>
        <p className="holiday-form-hint">同一天再次新增會覆蓋原本的名稱與類型。</p>
      </section>

      {error ? (
        <section className="admin-panel admin-empty">
          <strong>假日資料讀取失敗</strong>
          <p>請確認最新 database migration（202608250018）已套用。</p>
        </section>
      ) : holidays.length === 0 ? (
        <section className="admin-panel admin-empty">
          <strong>{year} 年尚未建立任何假日</strong>
          <p>從上方表單新增第一筆，或切換年份查看其他年度。</p>
        </section>
      ) : (
        <section className="admin-panel">
          <ul className="holiday-list">
            {holidays.map((holiday) => (
              <li key={holiday.id}>
                <div className="holiday-list-main">
                  <span className={`holiday-kind holiday-kind-${holiday.kind}`}>{holidayKindLabels[holiday.kind]}</span>
                  <div>
                    <strong>{holiday.name}</strong>
                    <small>{dateLabel(holiday.holiday_date)}{holiday.note ? ` · ${holiday.note}` : ""}</small>
                  </div>
                </div>
                <form action={deleteHoliday}>
                  <input name="holidayId" type="hidden" value={holiday.id} />
                  <input name="year" type="hidden" value={year} />
                  <button aria-label={`刪除 ${holiday.name}`} className="admin-button ghost" type="submit"><Trash2 size={15} /> 刪除</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
