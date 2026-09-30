import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), exchange: vi.fn(), workspace: vi.fn(), rpc: vi.fn() }));
vi.mock("../lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("../lib/workspace", () => ({ getWorkspaceContext: mocks.workspace }));
import { GET as callback } from "../app/auth/callback/route";
import { GET as pushGet, POST as pushPost, DELETE as pushDelete } from "../app/api/push/route";
import { isAllowedPushEndpoint } from "../lib/push-contract";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: mocks.exchange }, rpc: mocks.rpc });
  mocks.workspace.mockResolvedValue(null);
});

describe("entry security boundaries", () => {
  it.each(["/\\evil.example", "/\t/evil.example", "/\n/evil.example", "//evil.example", "/.//evil.example"])(
    "keeps a successful auth callback on-site for %j", async (next) => {
      const url = new URL("https://hrms.example/auth/callback");
      url.searchParams.set("code", "test-code");
      url.searchParams.set("next", next);
      const response = await callback(new Request(url));
      expect(response.headers.get("location")).toBe("https://hrms.example/");
    },
  );
  it("preserves a valid callback destination", async () => {
    const response = await callback(new Request("https://hrms.example/auth/callback?code=test&next=%2Fattendance%3Fmonth%3D8"));
    expect(response.headers.get("location")).toBe("https://hrms.example/attendance?month=8");
  });
  it("does not exchange a missing code or honor an external failure destination", async () => {
    const response = await callback(new Request("https://hrms.example/auth/callback?next=//evil.example"));
    expect(response.headers.get("location")).toBe("https://hrms.example/login?error=callback_failed");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("rejects anonymous push reads and writes before accessing storage", async () => {
    expect((await pushGet()).status).toBe(401);
    expect((await pushPost(new Request("https://hrms.example/api/push", {
      method: "POST", headers: { origin: "https://hrms.example" }, body: "{}",
    }))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(["https://evil.example", "null", ""])("rejects push mutations from origin %j", async (origin) => {
    for (const handler of [pushPost, pushDelete]) {
      const response = await handler(new Request("https://hrms.example/api/push", {
        method: "POST", headers: origin ? { origin } : {}, body: "{}",
      }));
      expect(response.status).toBe(403);
    }
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it.each([
    "https://127.0.0.1/internal", "https://169.254.169.254/latest/meta-data/",
    "http://fcm.googleapis.com/push", "https://fcm.googleapis.com.evil.example/push",
    "https://fcm.googleapis.com@evil.example/push", "https://user@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:8443/push", "https://evil.example/#web.push.apple.com",
  ])("rejects SSRF push destination %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
