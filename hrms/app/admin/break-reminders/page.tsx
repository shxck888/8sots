import { Bell } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { PushReminderSettings } from "@/app/punch/push-reminder-settings";

export const dynamic = "force-dynamic";

export default async function BreakRemindersPage() {
  const admin = await getAdminContext("attendance.break_notify");
  if (!admin) redirect("/");
  return <>
    <header className="admin-page-header"><div><h1>員工休息到時提醒</h1><p>員工吃飯休息滿 30 分鐘時，通知主管確認返回工作。</p></div></header>
    <section className="admin-panel">
      <h2><Bell size={20} aria-hidden="true" /> 這台裝置的推播通知</h2>
      <p>上午吃飯、下午吃飯，以及午休結束後自動開始的吃飯休息，滿 30 分鐘都會提醒。</p>
      <p>通知會顯示「○○員工休息時間已到」。吃飯休息自動結束，員工無需再打結束卡；午休仍需打結束卡。</p>
      <PushReminderSettings audience="supervisor" />
      <p className="admin-help-text">同一裝置的吃飯提醒與主管提醒共用這個推播開關。</p>
      <p className="admin-help-text">推播通常在到時後約 1 分鐘內送出，實際顯示時間依網路與裝置通知設定。iPhone 請先將系統加入主畫面，再允許通知。</p>
    </section>
  </>;
}
