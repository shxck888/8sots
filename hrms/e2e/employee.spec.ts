import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

const username = process.env.E2E_EMPLOYEE_USERNAME;
const password = process.env.E2E_EMPLOYEE_PASSWORD;

test.describe("employee browser journey", () => {
  test.skip(!username || !password, "Set E2E_EMPLOYEE_USERNAME and E2E_EMPLOYEE_PASSWORD for authenticated coverage.");

  test("opens attendance, requests, notifications and payslips then logs out", async ({ page }) => {
    await login(page, username!, password!);
    const routes = [
      ["/attendance", "出勤紀錄"],
      ["/requests", "申請中心"],
      ["/notifications", "通知中心"],
      ["/payslips", "我的薪資單"],
    ] as const;
    for (const [path, heading] of routes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    }
    await logout(page);
  });

  test("creates and withdraws a disposable leave request", async ({ page }) => {
    test.skip(!process.env.E2E_LEAVE_DATE, "Set E2E_LEAVE_DATE only for a disposable staging database.");
    await login(page, username!, password!);
    await page.goto("/requests");
    const leaveCard = page.locator(".work-request-form-card").filter({ hasText: "請假申請" });
    await leaveCard.locator('select[name="leaveTypeId"]').selectOption({ index: 1 });
    await leaveCard.locator('input[name="leaveDate"]').fill(process.env.E2E_LEAVE_DATE!);
    await leaveCard.locator('input[name="startsTime"]').fill("10:00");
    await leaveCard.locator('input[name="endsTime"]').fill("11:00");
    await leaveCard.locator('textarea[name="reason"]').fill(`E2E 自動測試 ${Date.now()}`);
    await leaveCard.getByRole("button", { name: "送出申請" }).click();
    await expect(leaveCard.getByText("申請已送出", { exact: false })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "撤回申請" }).first().click();
    await expect(page.getByText("已撤回").first()).toBeVisible();
  });
});
