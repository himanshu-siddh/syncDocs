"use client";

import Dexie, { type Table } from "dexie";

import type {
  LocalDocument,
  PendingDeletedDocument,
  PendingDocumentWrite,
  QueuedOperation,
} from "@/types/document";

type SyncCursor = {
  documentId: string;
  lastPulledAt?: string;
  lastPushedAt?: string;
};

class LocalEditorDatabase extends Dexie {
  documents!: Table<LocalDocument, string>;
  operations!: Table<QueuedOperation, string>;
  cursors!: Table<SyncCursor, string>;
  deletedDocuments!: Table<PendingDeletedDocument, string>;
  pendingDocumentWrites!: Table<PendingDocumentWrite, string>;

  constructor() {
    super("local-first-collab-editor");

    // Versioned tables let future migrations preserve offline work already
    // stored on users' devices.
    this.version(1).stores({
      documents: "id, updatedAt, role",
      operations: "id, documentId, createdAt",
      cursors: "documentId",
    });

    this.version(2).stores({
      documents: "id, updatedAt, role",
      operations: "id, documentId, createdAt",
      cursors: "documentId",
      deletedDocuments: "documentId, deletedAt",
    });

    this.version(3).stores({
      documents: "id, updatedAt, role",
      operations: "id, documentId, createdAt",
      cursors: "documentId",
      deletedDocuments: "documentId, deletedAt",
      pendingDocumentWrites: "documentId, updatedAt",
    });
  }
}

export const localDb = new LocalEditorDatabase();

export async function upsertLocalDocument(document: LocalDocument) {
  await localDb.documents.put(document);
}

export async function queueOperation(operation: QueuedOperation) {
  await localDb.operations.put(operation);
}

export async function getQueuedOperations(documentId: string) {
  return localDb.operations.where("documentId").equals(documentId).sortBy("createdAt");
}

export async function deleteQueuedOperations(ids: string[]) {
  if (ids.length > 0) {
    await localDb.operations.bulkDelete(ids);
  }
}

export async function getSyncCursor(documentId: string) {
  return localDb.cursors.get(documentId);
}

export async function saveSyncCursor(cursor: SyncCursor) {
  await localDb.cursors.put(cursor);
}

export async function deleteLocalDocument(documentId: string) {
  await localDb.transaction(
    "rw",
    localDb.documents,
    localDb.operations,
    localDb.cursors,
    localDb.pendingDocumentWrites,
    async () => {
      await localDb.documents.delete(documentId);
      await localDb.operations.where("documentId").equals(documentId).delete();
      await localDb.cursors.delete(documentId);
      await localDb.pendingDocumentWrites.delete(documentId);
    },
  );

  // y-indexeddb stores each Y.Doc in its own IndexedDB database named by the
  // persistence key. Removing it prevents old CRDT content from reappearing.
  indexedDB.deleteDatabase(`document-${documentId}`);
}

export async function queueDeletedDocument(document: PendingDeletedDocument) {
  await localDb.deletedDocuments.put(document);
}

export async function removeDeletedDocument(documentId: string) {
  await localDb.deletedDocuments.delete(documentId);
}

export async function getPendingDeletedDocuments() {
  return localDb.deletedDocuments.toArray();
}

export async function queueDocumentWrite(document: PendingDocumentWrite) {
  await localDb.pendingDocumentWrites.put(document);
}

export async function removeDocumentWrite(documentId: string) {
  await localDb.pendingDocumentWrites.delete(documentId);
}

export async function getPendingDocumentWrites() {
  return localDb.pendingDocumentWrites.toArray();
}
