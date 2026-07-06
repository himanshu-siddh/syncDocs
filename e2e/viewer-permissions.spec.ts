import { expect, test } from "@playwright/test";

import { loginViaUi } from "./helpers/auth";
import { openDocument } from "./helpers/editor";
import { testEmail } from "./helpers/ids";
import { createYjsUpdateBase64, pushSyncOperation } from "./helpers/sync-api";
import {
  addDocumentMember,
  cleanupTestData,
  createDocumentForUser,
  createTestUser,
} from "./helpers/test-db";

test.describe("Viewer permissions", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("blocks viewer UI edits and sync push requests", async ({ page }) => {
    const owner = await createTestUser("Owner", testEmail("viewer-owner"));
    const viewer = await createTestUser("Viewer", testEmail("viewer-user"));
    const { documentId } = await createDocumentForUser(owner, "Viewer Restricted Doc");
    await addDocumentMember(documentId, viewer, "VIEWER");

    await loginViaUi(page, viewer);
    await openDocument(page, documentId);

    await expect(page.getByText("You have viewer access. Editing is disabled.")).toBeVisible();
    await expect(page.locator(".ProseMirror")).toHaveAttribute("contenteditable", "false");

    const pushResponse = await pushSyncOperation(page.request, documentId, createYjsUpdateBase64("blocked"));
    expect(pushResponse.status()).toBe(403);
  });
});
