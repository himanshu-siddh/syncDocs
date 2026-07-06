// @vitest-environment node

import { randomUUID } from "crypto";

import { hash } from "bcryptjs";
import { describe, expect, it, afterAll, beforeEach } from "vitest";
import * as Y from "yjs";

import type { DocumentRole } from "@/types/document";
import { cleanupTestData, disconnectTestPrisma, getTestPrisma } from "../../e2e/helpers/test-db";

function toBytes(update: Uint8Array) {
  return Buffer.from(update);
}

describe("Sync API integration", () => {
  const prisma = getTestPrisma();
  let ownerId = "";
  let editorId = "";
  let documentId = "";

  beforeEach(async () => {
    await cleanupTestData();

    const passwordHash = await hash("Password123!", 12);
    const owner = await prisma.user.create({
      data: { email: "sync-api-owner@test.local", name: "Owner", passwordHash },
    });
    const editor = await prisma.user.create({
      data: { email: "sync-api-editor@test.local", name: "Editor", passwordHash },
    });

    ownerId = owner.id;
    editorId = editor.id;

    const document = await prisma.document.create({
      data: {
        title: "Sync API Doc",
        ownerId,
        members: {
          create: [
            { userId: ownerId, role: "OWNER" satisfies DocumentRole },
            { userId: editorId, role: "EDITOR" satisfies DocumentRole },
          ],
        },
      },
    });

    documentId = document.id;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectTestPrisma();
  });

  it("stores append-only sync operations idempotently", async () => {
    const operationId = randomUUID();
    const payload = toBytes(
      Y.encodeStateAsUpdate(
        (() => {
          const doc = new Y.Doc();
          doc.getText("shared").insert(0, "alpha");
          return doc;
        })(),
      ),
    );

    await prisma.syncOperation.createMany({
      data: [{ id: operationId, documentId, userId: ownerId, payload }],
      skipDuplicates: true,
    });

    await prisma.syncOperation.createMany({
      data: [{ id: operationId, documentId, userId: ownerId, payload }],
      skipDuplicates: true,
    });

    expect(await prisma.syncOperation.count({ where: { documentId, id: operationId } })).toBe(1);
  });

  it("merges remote operations pulled from the database into a local Y.Doc", async () => {
    const left = new Y.Doc();
    left.getText("shared").insert(0, "left");
    const right = new Y.Doc();
    right.getText("shared").insert(0, "right");

    await prisma.syncOperation.createMany({
      data: [
        {
          id: randomUUID(),
          documentId,
          userId: ownerId,
          payload: toBytes(Y.encodeStateAsUpdate(left)),
        },
        {
          id: randomUUID(),
          documentId,
          userId: editorId,
          payload: toBytes(Y.encodeStateAsUpdate(right)),
        },
      ],
    });

    const operations = await prisma.syncOperation.findMany({
      where: { documentId },
      orderBy: { createdAt: "asc" },
    });

    const merged = new Y.Doc();
    for (const operation of operations) {
      Y.applyUpdate(merged, operation.payload);
    }

    const mergedText = merged.getText("shared").toString();
    expect(mergedText).toContain("left");
    expect(mergedText).toContain("right");
  });

  it("creates a new operation when restoring snapshots instead of deleting history", async () => {
    const snapshotDoc = new Y.Doc();
    snapshotDoc.getText("shared").insert(0, "snapshot");
    const snapshotState = toBytes(Y.encodeStateAsUpdate(snapshotDoc));

    const snapshot = await prisma.documentSnapshot.create({
      data: {
        documentId,
        userId: ownerId,
        title: "Restore point",
        state: snapshotState,
      },
    });

    const beforeCount = await prisma.syncOperation.count({ where: { documentId } });

    await prisma.syncOperation.create({
      data: {
        id: randomUUID(),
        documentId,
        userId: ownerId,
        payload: snapshot.state,
      },
    });

    const afterCount = await prisma.syncOperation.count({ where: { documentId } });
    expect(afterCount).toBeGreaterThan(beforeCount);
    expect(await prisma.documentSnapshot.count({ where: { id: snapshot.id } })).toBe(1);
  });
});
