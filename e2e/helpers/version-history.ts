import { expect, type Page } from "@playwright/test";

function versionHistoryPanel(page: Page) {
  return page.locator("aside").filter({ has: page.getByRole("heading", { name: "Version History" }) });
}

export async function createSnapshot(page: Page, title: string) {
  const panel = versionHistoryPanel(page);
  await panel.locator("input").fill(title);
  await panel.locator("button").first().click();
  await expect(panel.getByText(title)).toBeVisible({ timeout: 15_000 });
}

export async function restoreSnapshot(page: Page, title: string) {
  const panel = versionHistoryPanel(page);
  const snapshotRow = panel.locator("div.rounded-lg").filter({ hasText: title });
  const restoreResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/snapshots/") &&
      response.url().includes("/restore"),
  );
  await snapshotRow.getByRole("button", { name: "Restore" }).click();
  const response = await restoreResponse;
  expect(response.ok()).toBeTruthy();
}
