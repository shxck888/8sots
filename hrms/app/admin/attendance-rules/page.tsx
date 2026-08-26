import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { GRACE_MAX, GRACE_MIN, graceLabel } from "@/lib/attendance-rules";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAttendanceRuleSet } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  input: "規則內容格式不正確，請確認寬限分鐘為 0–120 的整數。",
  permission: "你沒有維護出勤規則的權限。",
  save: "出勤規則儲存失敗，請稍後再試。",
};

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

export default async function AttendanceRulesPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const admin = await getAdminContext("attendance.manage");
  if (!admin) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("attendance_rule_sets")
    .select("id, version, late_grace_minutes, early_leave_grace_minutes, effective_from")
    .eq("tenant_id", admin.tenantId)
    .order("effective_from", { ascending: false })
    .order("version", { ascending: false });
  const ruleSets = data ?? [];

  const today = todayIso();
  // The rule set calculate_attendance would use for work done today: greatest
  // effective_from on or before today, tie-broken by the highest version.
  const effectiveNow = ruleSets.find((rule) => rule.effective_from <= today) ?? null;

  return (
    <>
      <header className="admin-page-header">
        <div>
          <span className="admin-eyebrow">ATTENDANCE RULES</span>
          <h1>出勤規則</h1>
          <p>設定遲到／早退寬限分鐘並指定生效日；每次儲存都會建立新版本，舊版保留供歷史重算。</p>
        </div>
      </header>

      {params.saved ? <div className="admin-success">已建立新版出勤規則。</div> : null}
      {params.error ? <div className="admin-form-error schedule-message">{errorMessages[params.error] ?? errorMessages.save}</div> : null}

      <section className="admin-panel">
        <form action={createAttendanceRuleSet} className="rule-form">
          <div className="rule-form-field">
            <label htmlFor="lateGraceMinutes">遲到寬限（分鐘）</label>
            <input id="lateGraceMinutes" name="lateGraceMinutes" type="number" inputMode="numeric" min={GRACE_MIN} max={GRACE_MAX} defaultValue={effectiveNow?.late_grace_minutes ?? 0} required />
          </div>
          <div className="rule-form-field">
            <label htmlFor="earlyLeaveGraceMinutes">早退寬限（分鐘）</label>
            <input id="earlyLeaveGraceMinutes" name="earlyLeaveGraceMinutes" type="number" inputMode="numeric" min={GRACE_MIN} max={GRACE_MAX} defaultValue={effectiveNow?.early_leave_grace_minutes ?? 0} required />
          </div>
          <div className="rule-form-field">
            <label htmlFor="effectiveFrom">生效日</label>
            <input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={today} required />
          </div>
          <button className="admin-button primary" type="submit"><SlidersHorizontal size={16} /> 建立新版規則</button>
        </form>
        <p className="rule-form-hint">寬限 0–120 分鐘。生效日當天（含）起的出勤計算會採用此版本；同一天有多個版本時以最新建立者為準。目前寬限只影響異常標記，不代表扣薪或加班認列。</p>
      </section>

      {error ? (
        <section className="admin-panel admin-empty">
          <strong>出勤規則讀取失敗</strong>
          <p>請確認最新 database migration（202608250019）已套用。</p>
        </section>
      ) : ruleSets.length === 0 ? (
        <section className="admin-panel admin-empty">
          <strong>尚無出勤規則版本</strong>
          <p>從上方建立第一版規則。</p>
        </section>
      ) : (
        <section className="admin-panel">
          <ul className="rule-list">
            {ruleSets.map((rule) => (
              <li key={rule.id} className={effectiveNow && rule.id === effectiveNow.id ? "rule-active" : undefined}>
                <div className="rule-list-main">
                  <span className="rule-version">V{rule.version}</span>
                  <div>
                    <strong>遲到 {graceLabel(rule.late_grace_minutes)}　早退 {graceLabel(rule.early_leave_grace_minutes)}</strong>
                    <small>生效日 {dateLabel(rule.effective_from)}</small>
                  </div>
                </div>
                {effectiveNow && rule.id === effectiveNow.id ? (
                  <span className="rule-current"><CheckCircle2 size={14} /> 目前適用</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
