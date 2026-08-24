import { describe, expect, it } from "vitest";
import { publicEnvSchema } from "../lib/env";

describe("publicEnvSchema", () => {
  it("accepts a secure Supabase configuration", () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a-valid-publishable-key-value",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an insecure URL", () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: "http://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "a-valid-publishable-key-value",
    });
    expect(result.success).toBe(false);
  });
});
