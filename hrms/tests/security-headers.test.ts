import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("response security headers", () => {
  it("protects every route while retaining first-party geolocation", async () => {
    const rules = await nextConfig.headers?.();
    const headers = new Map(rules?.[0]?.headers.map(({ key, value }) => [key, value]));
    expect(rules?.[0]?.source).toBe("/:path*");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("https://*.supabase.co");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=(self)");
    expect(headers.get("Strict-Transport-Security")).toContain("includeSubDomains");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
