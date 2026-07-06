import { expect, test } from "@playwright/test";

import { loginViaUi } from "./helpers/auth";
import {
  expectEditorContains,
  openDocument,
  triggerSyncNow,
  typeInEditor,
  waitForSynced,
} from "./helpers/editor";
import { testEmail } from "./helpers/ids";
import { cleanupTestData, countSyncOperations, createDocumentForUser, createTestUser } from "./helpers/test-db";
import { createSnapshot, restoreSnapshot } from "./helpers/version-history";

test.describe("Version history restore", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("append a new sync operation on restore without deleting prior history", async ({ page }) => {
    const owner = await createTestUser("Owner", testEmail("version-owner"));
    const { documentId } = await createDocumentForUser(owner, "Version History Doc");

    const snapshotPhrase = `snapshot-${Date.now()}`;
    const laterPhrase = `later-${Date.now()}`;
    const snapshotTitle = `Snapshot ${Date.now()}`;

    await loginViaUi(page, owner);
    await openDocument(page, documentId);

    await typeInEditor(page, snapshotPhrase);
    await triggerSyncNow(page);
    await waitForSynced(page);

    await createSnapshot(page, snapshotTitle);

    await typeInEditor(page, ` ${laterPhrase}`);
    await triggerSyncNow(page);
    await waitForSynced(page);
    await expectEditorContains(page, laterPhrase);

    const operationsBeforeRestore = await countSyncOperations(documentId);

    await restoreSnapshot(page, snapshotTitle);
    await expectEditorContains(page, snapshotPhrase);

    await expect
      .poll(async () => countSyncOperations(documentId), { timeout: 15_000 })
      .toBeGreaterThan(operationsBeforeRestore);
  });
});
