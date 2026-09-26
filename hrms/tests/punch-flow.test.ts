import { describe, expect, it } from "vitest";
import { getPunchFlow, actionEventType, type PunchAction, type FlowRecord } from "../lib/punch-flow";
import { isAllowedPushEndpoint } from "../lib/push-contract";
const at = (time: string) => Date.parse(`2026-09-25T${time}:00+08:00`);
function record(action: PunchAction, time: string): FlowRecord {
  return { id: crypto.randomUUID(), work_date: "2026-09-25", occurred_at: new Date(at(time)).toISOString(), event_type: actionEventType(action), punch_action: action };
}
describe("explicit punch flow", () => {
  it("restores a meal countdown and automatically resumes work at 30 minutes", () => {
    const records = [record("clock_in", "10:00"), record("meal_morning", "11:00")];
    expect(getPunchFlow(records, at("11:27"), true).remainingSeconds).toBe(180);
    const ended = getPunchFlow(records, at("11:30"), true);
    expect(ended.remainingSeconds).toBe(0);
    expect(ended.status).toBe("工作中");
  });
  it("offers lunch end independently of a missed clock in and morning meal", () => {
    const flow = getPunchFlow([record("lunch_start", "14:00")], at("16:00"), true);
    expect(flow.suggested).toBe("lunch_end");
    expect(flow.missing).toContain("clock_in");
  });
  it("does not automatically start eating when lunch ends", () => {
    const records = [record("lunch_end", "16:00")];
    const flow = getPunchFlow(records, at("16:30"), true);
    expect(flow.remainingSeconds).toBe(0);
    expect(flow.suggested).toBe("meal_afternoon");
  });
  it("does not suggest lunch punches on a continuous shift", () => {
    const flow = getPunchFlow([record("clock_in", "10:00")], at("14:00"), false);
    expect(["lunch_start", "lunch_end"]).not.toContain(flow.suggested);
  });
  it("finishes an interrupted meal and keeps skipped meals visible after clock out", () => {
    const records = [record("clock_in", "10:00"), record("meal_morning", "11:00"), record("meal_end", "11:20"), record("clock_out", "21:00")];
    const flow = getPunchFlow(records, at("21:01"), true);
    expect(flow.remainingSeconds).toBe(0);
    expect(flow.suggested).toBeNull();
    expect(flow.missing).toContain("meal_afternoon");
  });
});
describe("push destination security", () => {
  it("allows browser push services and rejects arbitrary or credentialed URLs", () => {
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    for (const url of ["http://fcm.googleapis.com/abc", "https://fcm.googleapis.com.evil.test/abc", "https://127.0.0.1/abc", "https://user:pass@fcm.googleapis.com/abc", "https://fcm.googleapis.com:444/abc"]) expect(isAllowedPushEndpoint(url)).toBe(false);
  });
});
