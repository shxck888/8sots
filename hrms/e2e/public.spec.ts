import { expect, test } from "@playwright/test";

test("login page renders a usable account form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登入員工工作台" })).toBeVisible();
  await expect(page.getByLabel("帳號")).toBeEditable();
  await expect(page.getByLabel("密碼")).toBeEditable();
  await expect(page.getByText("忘記密碼？請聯絡門市主管或 HR", { exact: false })).toBeVisible();
});

test("protected employee and administrator routes redirect to login", async ({ page }) => {
  for (const path of ["/attendance", "/requests", "/payslips", "/notifications", "/admin/payroll"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "登入員工工作台" })).toBeVisible();
  }
});

test("health endpoint reports a healthy application", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "restaurant-ehr" });
});
