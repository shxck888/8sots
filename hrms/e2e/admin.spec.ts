import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

const username = process.env.E2E_ADMIN_USERNAME;
const password = process.env.E2E_ADMIN_PASSWORD;

test.describe("administrator browser journey", () => {
  test.skip(!username || !password, "Set E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD for authenticated coverage.");

  test("opens every critical administration workflow and notification center", async ({ page }) => {
    await login(page, username!, password!);
    const routes = [
      ["/admin/employees", "員工管理"],
      ["/admin/schedules", "週排班"],
      ["/admin/attendance", "出勤與打卡"],
      ["/admin/requests", "申請審核"],
      ["/admin/payroll", "薪資管理"],
      ["/admin/settings", "系統設定"],
      ["/admin/audit", "稽核紀錄"],
      ["/admin/account", "帳號安全"],
      ["/notifications", "通知中心"],
    ] as const;
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await logout(page);
  });

  test("payroll exposes versioned statutory, employee and leave settings", async ({ page }) => {
    await login(page, username!, password!);
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "法定扣款與加班計薪" })).toBeVisible();
    await page.goto("/admin/payroll");
    await expect(page.getByRole("heading", { name: "員工投保與扣繳版本" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "假別給薪比例" })).toBeVisible();
  });
});
