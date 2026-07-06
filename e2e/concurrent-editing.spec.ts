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
import {
  addDocumentMember,
  cleanupTestData,
  countSyncOperations,
  createDocumentForUser,
  createTestUser,
} from "./helpers/test-db";

test.describe("Concurrent editing and Yjs merge", () => {
  test.afterEach(async () => {
    await cleanupTestData();
  });

  test("merges edits from two users through sync without data loss", async ({ browser }) => {
    const owner = await createTestUser("Owner", testEmail("merge-owner"));
    const editor = await createTestUser("Editor", testEmail("merge-editor"));
    const { documentId } = await createDocumentForUser(owner, "Concurrent Doc");
    await addDocumentMember(documentId, editor, "EDITOR");

    const ownerPhrase = `owner-${Date.now()}`;
    const editorPhrase = `editor-${Date.now()}`;

    const ownerContext = await browser.newContext();
    const editorContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const editorPage = await editorContext.newPage();

    await loginViaUi(ownerPage, owner);
    await loginViaUi(editorPage, editor);

    await openDocument(ownerPage, documentId);
    await typeInEditor(ownerPage, ownerPhrase);
    await triggerSyncNow(ownerPage);
    await waitForSynced(ownerPage);

    await expect
      .poll(async () => countSyncOperations(documentId), { timeout: 20_000 })
      .toBeGreaterThan(0);

    await openDocument(editorPage, documentId);
    await expectEditorContains(editorPage, ownerPhrase);

    await typeInEditor(editorPage, editorPhrase);
    await triggerSyncNow(editorPage);
    await waitForSynced(editorPage);

    await triggerSyncNow(ownerPage);
    await waitForSynced(ownerPage);

    await expectEditorContains(ownerPage, ownerPhrase);
    await expectEditorContains(ownerPage, editorPhrase);
    await expectEditorContains(editorPage, ownerPhrase);
    await expectEditorContains(editorPage, editorPhrase);

    expect(await countSyncOperations(documentId)).toBeGreaterThanOrEqual(2);

    await ownerContext.close();
    await editorContext.close();
  });
});
