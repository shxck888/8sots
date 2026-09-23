import { describe, expect, it } from "vitest";
import employeeManifest from "../app/manifest";
import { GET } from "../app/kiosk/manifest.webmanifest/route";

describe("dedicated kiosk PWA", () => {
  it("launches the paired kiosk separately from the employee workbench", async () => {
    const employee = employeeManifest();
    const response = GET();
    const kiosk = await response.json();
    expect(response.headers.get("content-type")).toContain("application/manifest+json");
    expect(employee.start_url).toBe("/");
    expect(kiosk).toMatchObject({
      id: "/kiosk",
      start_url: "/kiosk",
      scope: "/kiosk",
      display: "standalone",
    });
    expect(kiosk.id).not.toBe(employee.start_url);
    expect(kiosk.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512" }),
    ]));
  });
});
