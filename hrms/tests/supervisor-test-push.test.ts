import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), server: vi.fn(), send: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/workspace", () => ({ getWorkspaceContext: mocks.workspace }));
vi.mock("../lib/supabase/server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));

import { POST } from "../app/api/push/test/route";

const endpoint = "https://web.push.apple.com/supervisor-device";
const request = (value: unknown = { endpoint }, origin = "https://example.test") => new Request("https://example.test/api/push/test", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(value),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "public");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private");
  mocks.workspace.mockResolvedValue({ tenantId: "tenant-1", userId: "admin-1", canReceiveBreakNotifications: true });
  mocks.maybeSingle.mockResolvedValue({ data: { endpoint, p256dh: "p256dh", auth_key: "auth" }, error: null });
  mocks.rpc.mockResolvedValue({ error: null });
  const query = { eq: vi.fn(), maybeSingle: mocks.maybeSingle };
  query.eq.mockReturnValue(query);
  mocks.server.mockResolvedValue({ from: vi.fn(() => ({ select: vi.fn(() => query) })), rpc: mocks.rpc });
  mocks.send.mockResolvedValue({});
});

describe("supervisor test push", () => {
  it("requires same-origin request and supervisor permission", async () => {
    expect((await POST(request({ endpoint }, "https://other.test"))).status).toBe(403);
    mocks.workspace.mockResolvedValueOnce({ tenantId: "tenant-1", userId: "employee-1", canReceiveBreakNotifications: false });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("sends only to this supervisor's saved subscription", async () => {
    expect((await POST(request())).status).toBe(200);
    const [subscription, payload] = mocks.send.mock.calls[0];
    expect(subscription.endpoint).toBe(endpoint);
    expect(JSON.parse(payload).title).toContain("測試通知");
    const query = (await mocks.server.mock.results[0].value).from("employee_push_subscriptions").select();
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(query.eq).toHaveBeenCalledWith("user_id", "admin-1");
    expect(query.eq).toHaveBeenCalledWith("endpoint", endpoint);
  });

  it("refuses unsaved endpoints and reports expired subscriptions", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request())).status).toBe(404);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.send.mockRejectedValueOnce({ statusCode: 410 });
    expect((await POST(request())).status).toBe(410);
    expect(mocks.rpc).toHaveBeenCalledWith("remove_my_push_subscription", { p_endpoint: endpoint });
  });
});
