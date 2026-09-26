import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAllowedPushEndpoint } from "@/lib/push-contract";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Job = { id: string; lease_id: string; kind: "meal_ending" | "afternoon_start"; expires_at: string;
  subscriptions: (webpush.PushSubscription & { id: string })[] };
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return Response.json({ error: "push not configured" }, { status: 503 });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_meal_push_jobs");
  if (error) return Response.json({ error: "queue unavailable" }, { status: 503 });
  const jobs = data as unknown as Job[];
  let sent = 0, failed = 0;
  await Promise.all(jobs.map(async job => {
    let retry = false;
    const ttl = Math.max(0, Math.floor((Date.parse(job.expires_at) - Date.now()) / 1000));
    if (ttl > 0) await Promise.all(job.subscriptions.map(async subscription => {
      if (!isAllowedPushEndpoint(subscription.endpoint)) return;
      try {
        await webpush.sendNotification(subscription, JSON.stringify({ title: job.kind === "meal_ending" ? "吃飯休息即將結束" : "下午吃飯時間到了",
          body: job.kind === "meal_ending" ? "吃飯休息剩約 3 分鐘，請準備返回工作。" : "預定 16:30–17:00 吃飯；請實際開始休息時打卡。", tag: `meal-${job.id}` }),
        { TTL: ttl, urgency: "high", timeout: 5000, vapidDetails: { subject: process.env.VAPID_SUBJECT || "https://hrms.8sots.com.tw", publicKey, privateKey } });
        await supabase.rpc("mark_meal_push_delivered", { p_job_id: job.id, p_lease_id: job.lease_id, p_subscription_id: subscription.id });
        sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await supabase.from("employee_push_subscriptions").delete().eq("id", subscription.id);
        else { retry = true; failed++; }
      }
    }));
    if (!retry) await supabase.rpc("complete_meal_push_job", { p_job_id: job.id, p_lease_id: job.lease_id });
  }));
  return Response.json({ jobs: jobs.length, sent, failed });
}
