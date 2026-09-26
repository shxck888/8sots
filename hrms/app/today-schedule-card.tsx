import { CalendarDays } from "lucide-react";
import Link from "next/link";
import type { MyScheduleEntry } from "@/lib/my-schedule";
import { shiftMinuteLabel } from "@/lib/schedules";

export function TodayScheduleCard({ entry, workDate, linked, dayOff }: {
  entry?: MyScheduleEntry; workDate: string; linked: boolean; dayOff?: string | null;
}) {
  return <section className="schedule-card home-schedule-card">
    <div className="section-heading"><h2><CalendarDays size={19} />今日班表</h2><Link href="/my-schedule">查看月曆</Link></div>
    {entry?.segments.length ? <>
      <div className="home-shift-rows">{entry.segments.map(segment => <div key={segment.order}>
        <span>{entry.segments.length === 2 ? (segment.order === 1 ? "上午" : "下午") : entry.shiftName}</span>
        <time dateTime={`${workDate}T${shiftMinuteLabel(segment.startMinute)}+08:00`}>{shiftMinuteLabel(segment.startMinute)}–{shiftMinuteLabel(segment.endMinute)}</time>
      </div>)}</div>
      <p className="home-schedule-note">工時依實際打卡與休息紀錄計算</p>
    </> : <div className="home-schedule-empty"><strong>{dayOff ?? (linked ? "今日未排班" : "尚未連結員工資料")}</strong><p>{dayOff ? "依已發布班表顯示" : linked ? "目前沒有已發布排班，不代表已核准休假。" : "請聯絡管理員連結員工資料。"}</p></div>}
  </section>;
}
