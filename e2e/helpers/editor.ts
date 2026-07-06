import { expect, type Page } from "@playwright/test";

export async function waitForDocumentWorkspace(page: Page) {
  await expect(page.getByText("Loading local document...")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".ProseMirror")).toBeVisible({ timeout: 30_000 });
}

export async function createDocumentViaUi(page: Page, title: string) {
  await page.getByPlaceholder("New document title").fill(title);
  await page.getByRole("button", { name: "Create document" }).click();
  await page.waitForURL("**/documents/**", { timeout: 30_000, waitUntil: "commit" });
  await waitForDocumentWorkspace(page);
  return documentIdFromUrl(page.url());
}

export function documentIdFromUrl(url: string) {
  const pathname = new URL(url).pathname;
  return decodeURIComponent(pathname.split("/documents/")[1] ?? "");
}

export async function openDocument(page: Page, documentId: string) {
  await page.goto(`/documents/${documentId}`);
  await waitForDocumentWorkspace(page);
}

export async function typeInEditor(page: Page, text: string) {
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially(text, { delay: 15 });
}

export async function getEditorText(page: Page) {
  return page.locator(".ProseMirror").innerText();
}

export async function expectEditorContains(page: Page, text: string) {
  await expect.poll(async () => getEditorText(page), { timeout: 20_000 }).toContain(text);
}

export async function setNetworkOffline(page: Page, offline: boolean) {
  await page.context().setOffline(offline);
}

export async function expectOnlineStatus(page: Page, online: boolean) {
  await expect(page.getByText(online ? "Online" : "Offline", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
}

export async function triggerSyncNow(page: Page) {
  await page.getByRole("button", { name: "Sync now" }).click();
}

export async function waitForSyncStatus(page: Page, status: "synced" | "offline" | "syncing" | "error") {
  await expect(page.getByText(status, { exact: true })).toBeVisible({ timeout: 30_000 });
}

export async function waitForSynced(page: Page) {
  await waitForSyncStatus(page, "synced");
}
