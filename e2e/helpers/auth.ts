import type { Page } from "@playwright/test";

import type { TestUser } from "./test-db";

export async function registerViaUi(page: Page, user: Pick<TestUser, "name" | "email" | "password">) {
  await page.goto("/register");
  await page.getByPlaceholder("Name").fill(user.name);
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/documents**", { timeout: 30_000 });
}

export async function loginViaUi(page: Page, user: Pick<TestUser, "email" | "password">) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/documents**", { timeout: 30_000 });
}
