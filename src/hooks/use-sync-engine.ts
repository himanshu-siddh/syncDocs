"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { base64ToBytes, bytesToBase64 } from "@/sync/encoding";
import {
  deleteQueuedOperations,
  getQueuedOperations,
  getSyncCursor,
  queueOperation,
  saveSyncCursor,
} from "@/sync/local-db";
import type { SyncStatus } from "@/types/document";

type UseSyncEngineOptions = {
  documentId: string;
  title: string;
  ydoc: Y.Doc;
  canWrite: boolean;
  isOnline: boolean;
};

type PullOperation = {
  id: string;
  update: string;
  createdAt: string;
};

export function useSyncEngine({ documentId, title, ydoc, canWrite, isOnline }: UseSyncEngineOptions) {
  const [status, setStatus] = useState<SyncStatus>(isOnline ? "idle" : "offline");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pullRemoteOperations = useCallback(async () => {
    const cursor = await getSyncCursor(documentId);
    const params = cursor?.lastPulledAt ? `?since=${encodeURIComponent(cursor.lastPulledAt)}` : "";
    const response = await fetch(`/api/documents/${documentId}/sync/pull${params}`);

    if (response.status === 404 && documentId.startsWith("local-")) {
      return;
    }

    if (!response.ok) {
      throw new Error("Unable to pull remote operations");
    }

    const payload = (await response.json()) as {
      operations: PullOperation[];
      syncedAt: string;
    };

    payload.operations.forEach((operation) => {
      Y.applyUpdate(ydoc, base64ToBytes(operation.update), "remote");
    });

    await saveSyncCursor({
      documentId,
      lastPulledAt: payload.syncedAt,
      lastPushedAt: cursor?.lastPushedAt,
    });
  }, [documentId, ydoc]);

  const flushQueuedOperations = useCallback(async () => {
    if (!isOnline) {
      setStatus("offline");
      return;
    }

    setStatus("syncing");

    try {
      const queued = await getQueuedOperations(documentId);
      const isLocalDocument = documentId.startsWith("local-");

      if (queued.length > 0 && canWrite) {
        if (isLocalDocument) {
          const createResponse = await fetch("/api/documents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id: documentId, title }),
          });

          if (!createResponse.ok) {
            throw new Error("Unable to create offline document on the server");
          }
        }

        const response = await fetch(`/api/documents/${documentId}/sync/push`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operations: queued.map((operation) => ({
              id: operation.id,
              documentId: operation.documentId,
              update: bytesToBase64(operation.update),
              createdAt: operation.createdAt,
            })),
          }),
        });

        if (!response.ok) {
          throw new Error("Unable to push local operations");
        }

        const payload = (await response.json()) as { accepted: string[]; syncedAt: string };
        await deleteQueuedOperations(payload.accepted);
        const cursor = await getSyncCursor(documentId);
        await saveSyncCursor({
          documentId,
          lastPulledAt: cursor?.lastPulledAt,
          lastPushedAt: payload.syncedAt,
        });
      }

      await pullRemoteOperations();
      setStatus("synced");
    } catch {
      setStatus("error");
    }
  }, [canWrite, documentId, isOnline, pullRemoteOperations, title]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) {
      clearTimeout(syncTimer.current);
    }

    syncTimer.current = setTimeout(() => {
      void flushQueuedOperations();
    }, 750);
  }, [flushQueuedOperations]);

  useEffect(() => {
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (!canWrite || origin === "remote") {
        return;
      }

      void queueOperation({
        id: crypto.randomUUID(),
        documentId,
        update,
        createdAt: new Date().toISOString(),
      }).then(scheduleSync);
    };

    ydoc.on("update", handleUpdate);

    return () => {
      ydoc.off("update", handleUpdate);
      if (syncTimer.current) {
        clearTimeout(syncTimer.current);
      }
    };
  }, [canWrite, documentId, scheduleSync, ydoc]);

  useEffect(() => {
    if (isOnline) {
      const id = setTimeout(() => {
        void flushQueuedOperations();
      }, 0);

      return () => clearTimeout(id);
    } else {
      const id = setTimeout(() => setStatus("offline"), 0);

      return () => clearTimeout(id);
    }
  }, [flushQueuedOperations, isOnline]);

  return { status, flushQueuedOperations, pullRemoteOperations };
}
