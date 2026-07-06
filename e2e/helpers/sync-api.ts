import { randomUUID } from "crypto";

import * as Y from "yjs";
import type { APIRequestContext } from "@playwright/test";

export function encodeYjsUpdate(update: Uint8Array) {
  return Buffer.from(update).toString("base64");
}

export function createYjsUpdateBase64(content?: string) {
  const doc = new Y.Doc();

  if (content) {
    doc.getText("default").insert(0, content);
  }

  return encodeYjsUpdate(Y.encodeStateAsUpdate(doc));
}

export async function pushSyncOperation(
  request: APIRequestContext,
  documentId: string,
  updateBase64: string,
) {
  return request.post(`/api/documents/${documentId}/sync/push`, {
    data: {
      operations: [
        {
          id: randomUUID(),
          documentId,
          update: updateBase64,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });
}

export async function pullSyncOperations(request: APIRequestContext, documentId: string) {
  return request.get(`/api/documents/${documentId}/sync/pull`);
}
