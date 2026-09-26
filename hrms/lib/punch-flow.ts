import { z } from "zod";

export const punchActionSchema = z.enum(["clock_in", "meal_morning", "lunch_start", "lunch_end", "meal_afternoon", "meal_end", "clock_out"]);
export type PunchAction = z.infer<typeof punchActionSchema>;
export const punchActionLabels: Record<PunchAction, string> = {
  clock_in: "上班打卡", meal_morning: "開始上午吃飯", lunch_start: "開始午休",
  lunch_end: "午休結束", meal_afternoon: "開始下午吃飯", meal_end: "提前結束吃飯", clock_out: "下班打卡",
};
export type FlowRecord = { id: string; occurred_at: string; work_date: string; event_type: "clock_in" | "clock_out"; punch_action: string | null };
export const MEAL_DURATION_MS = 30 * 60_000;
export function actionEventType(action: PunchAction): "clock_in" | "clock_out" {
  return ["clock_in", "lunch_end", "meal_end"].includes(action) ? "clock_in" : "clock_out";
}
export function recordAction(record: FlowRecord, index: number, hasLunch: boolean): PunchAction {
  if (punchActionSchema.safeParse(record.punch_action).success) return record.punch_action as PunchAction;
  if (hasLunch && index === 1 && record.event_type === "clock_out") return "lunch_start";
  if (hasLunch && index === 2 && record.event_type === "clock_in") return "lunch_end";
  return record.event_type;
}
export function getPunchFlow(records: FlowRecord[], now: number, hasLunch: boolean) {
  const chronological = [...records].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  let boundaryIndex = 0;
  const events = chronological.map(record => {
    const action = recordAction(record, boundaryIndex, hasLunch);
    if (!["meal_morning", "meal_afternoon", "meal_end"].includes(action)) boundaryIndex++;
    return { ...record, action };
  });
  const done = new Set(events.map(event => event.action));
  const last = events.at(-1);
  const meal = last && ["meal_morning", "meal_afternoon"].includes(last.action) ? last : null;
  const mealEndsAt = meal ? Date.parse(meal.occurred_at) + MEAL_DURATION_MS : null;
  const remainingSeconds = mealEndsAt === null ? 0 : Math.max(0, Math.ceil((mealEndsAt - now) / 1000));
  const minute = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", hourCycle: "h23" }).format(now)) * 60
    + Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", minute: "2-digit" }).format(now));
  let suggested: PunchAction | null;
  if (done.has("clock_out")) suggested = null;
  else if (remainingSeconds > 0) suggested = "meal_end";
  else if (last?.action === "lunch_start") suggested = "lunch_end";
  else if (minute >= 20 * 60 + 30) suggested = "clock_out";
  else if (minute >= 16 * 60 + 30 && !done.has("meal_afternoon")) suggested = "meal_afternoon";
  else if (hasLunch && minute >= 16 * 60 && !done.has("lunch_end")) suggested = "lunch_end";
  else if (hasLunch && minute >= 13 * 60 + 30 && !done.has("lunch_start") && !done.has("lunch_end")) suggested = "lunch_start";
  else if (minute < 14 * 60 && done.has("clock_in") && !done.has("meal_morning")) suggested = "meal_morning";
  else if (!done.has("clock_in") && minute < 14 * 60) suggested = "clock_in";
  else if (hasLunch && done.has("clock_in") && !done.has("lunch_start") && !done.has("lunch_end")) suggested = "lunch_start";
  else if (!done.has("meal_afternoon")) suggested = "meal_afternoon";
  else suggested = "clock_out";
  const missing: PunchAction[] = [];
  if (events.length && !done.has("clock_in")) missing.push("clock_in");
  if (hasLunch && (done.has("lunch_end") || done.has("clock_out")) && !done.has("lunch_start")) missing.push("lunch_start");
  if (hasLunch && done.has("clock_out") && !done.has("lunch_end")) missing.push("lunch_end");
  if (done.has("clock_out")) {
    if (!done.has("meal_morning")) missing.push("meal_morning");
    if (!done.has("meal_afternoon")) missing.push("meal_afternoon");
  }
  return { events, done, suggested, remainingSeconds, mealEndsAt, missing,
    status: remainingSeconds > 0 ? "吃飯休息中" : last?.action === "lunch_start" ? "午休中" : done.has("clock_out") ? "已下班" : events.length ? "工作中" : "尚未打卡" };
}
