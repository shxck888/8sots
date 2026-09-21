import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(username);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入工作台" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /你好/ })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "登出" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "登入員工工作台" })).toBeVisible();
}
