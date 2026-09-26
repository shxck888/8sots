import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), remove: vi.fn(), admin: vi.fn() }));
vi.mock("../lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
import { GET } from "../app/api/cron/meal-reminders/route";
const job = () => ({ id: "job-1", lease_id: "lease-1", kind: "meal_ending", expires_at: new Date(Date.now() + 180_000).toISOString(), subscriptions: [{ id: "sub-1", endpoint: "https://web.push.apple.com/abc", keys: { p256dh: "key", auth: "auth" } }] });
const request = (secret = "test-secret") => new Request("https://example.test/api/cron/meal-reminders", { headers: { Authorization: `Bearer ${secret}` } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret"); vi.stubEnv("VAPID_PUBLIC_KEY", "public"); vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  mocks.rpc.mockResolvedValue({ data: [job()], error: null });
  mocks.send.mockResolvedValue({});
  mocks.remove.mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: () => ({ delete: () => ({ eq: mocks.remove }) }) });
});
describe("server meal push delivery", () => {
  it("rejects an unauthorized cron before accessing subscriptions", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("sends a short-lived reminder and records delivery with its lease", async () => {
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ jobs: 1, sent: 1, failed: 0 });
    const payload = JSON.parse(mocks.send.mock.calls[0][1] as string);
    expect(payload.title).toBe("吃飯休息即將結束");
    expect(mocks.send.mock.calls[0][2].TTL).toBeLessThanOrEqual(180);
    expect(mocks.rpc).toHaveBeenCalledWith("mark_meal_push_delivered", { p_job_id: "job-1", p_lease_id: "lease-1", p_subscription_id: "sub-1" });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_meal_push_job", { p_job_id: "job-1", p_lease_id: "lease-1" });
  });
  it("leaves transient failures pending and removes expired subscriptions", async () => {
    mocks.send.mockRejectedValueOnce({ statusCode: 503 });
    await GET(request());
    expect(mocks.rpc).not.toHaveBeenCalledWith("complete_meal_push_job", expect.anything());
    mocks.rpc.mockClear(); mocks.send.mockRejectedValueOnce({ statusCode: 410 });
    await GET(request());
    expect(mocks.remove).toHaveBeenCalledWith("id", "sub-1");
    expect(mocks.rpc).toHaveBeenCalledWith("complete_meal_push_job", expect.anything());
  });
  it("does not send an expired job or contact an arbitrary host", async () => {
    const expired = job(); expired.expires_at = new Date(Date.now() - 1000).toISOString();
    const unsafe = job(); unsafe.subscriptions[0].endpoint = "https://127.0.0.1/internal";
    mocks.rpc.mockResolvedValue({ data: [expired, unsafe], error: null });
    await GET(request());
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
