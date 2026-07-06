"use client";

import {
  getPendingDocumentWrites,
  queueDocumentWrite,
  removeDocumentWrite,
  upsertLocalDocument,
} from "@/sync/local-db";
import type { LocalDocument } from "@/types/document";

async function pushDocumentWrite(document: LocalDocument) {
  if (document.id.startsWith("local-")) {
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: document.id, title: document.title }),
    });

    if (!response.ok) {
      throw new Error("Unable to sync offline document create");
    }

    return;
  }

  const response = await fetch(`/api/documents/${document.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: document.title }),
  });

  if (!response.ok) {
    throw new Error("Unable to sync document update");
  }
}

export async function saveDocumentMetadata(document: LocalDocument, options?: { tryRemote?: boolean }) {
  await upsertLocalDocument(document);

  if (!options?.tryRemote || !navigator.onLine) {
    await queueDocumentWrite({
      documentId: document.id,
      title: document.title,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
    return;
  }

  try {
    await pushDocumentWrite(document);
    await removeDocumentWrite(document.id);
  } catch {
    await queueDocumentWrite({
      documentId: document.id,
      title: document.title,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  }
}

export async function flushDocumentMetadataWrites() {
  if (!navigator.onLine) {
    return;
  }

  const pendingWrites = await getPendingDocumentWrites();

  for (const pendingWrite of pendingWrites) {
    try {
      await pushDocumentWrite({
        id: pendingWrite.documentId,
        title: pendingWrite.title,
        role: "OWNER",
        createdAt: pendingWrite.createdAt,
        updatedAt: pendingWrite.updatedAt,
      });
      await removeDocumentWrite(pendingWrite.documentId);
    } catch {
      // Keep the queued write. It will retry on the next online event or refresh.
    }
  }
}
