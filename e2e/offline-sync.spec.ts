import { test } from "@playwright/test";

import { registerViaUi } from "./helpers/auth";
import {
  createDocumentViaUi,
  expectEditorContains,
  expectOnlineStatus,
  openDocument,
  setNetworkOffline,
  triggerSyncNow,
  typeInEditor,
  waitForSynced,
} from "./helpers/editor";
import { testEmail } from "./helpers/ids";
import { cleanupTestData } from "./helpers/test-db";

test.describe("Offline sync", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("persists offline edits after reconnect and sync", async ({ page, browser }) => {
    const email = testEmail("offline-user");
    const password = "Password123!";
    const offlinePhrase = `offline-edit-${Date.now()}`;

    await registerViaUi(page, { name: "Offline User", email, password });
    await createDocumentViaUi(page, "Offline Sync Doc");

    const documentId = decodeURIComponent(page.url().split("/documents/")[1]!);

    await setNetworkOffline(page, true);
    await expectOnlineStatus(page, false);

    await typeInEditor(page, offlinePhrase);

    await setNetworkOffline(page, false);
    await expectOnlineStatus(page, true);
    await triggerSyncNow(page);
    await waitForSynced(page);

    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto("/login");
    await freshPage.getByPlaceholder("Email").fill(email);
    await freshPage.getByPlaceholder("Password").fill(password);
    await freshPage.getByRole("button", { name: "Sign in" }).click();
    await freshPage.waitForURL("**/documents**", { timeout: 30_000 });
    await openDocument(freshPage, documentId);
    await expectEditorContains(freshPage, offlinePhrase);

    await freshContext.close();
  });
});
