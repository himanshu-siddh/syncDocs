"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { History, RotateCcw, Save } from "lucide-react";
import * as Y from "yjs";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bytesToBase64, base64ToBytes } from "@/sync/encoding";
import type { SnapshotTimelineItem } from "@/types/document";

type VersionHistoryProps = {
  documentId: string;
  ydoc: Y.Doc;
  canWrite: boolean;
};

export function VersionHistory({ documentId, ydoc, canWrite }: VersionHistoryProps) {
  const [snapshots, setSnapshots] = useState<SnapshotTimelineItem[]>([]);
  const [snapshotTitle, setSnapshotTitle] = useState("Manual snapshot");
  const [pending, startTransition] = useTransition();
  const isLocalDocument = documentId.startsWith("local-");

  const loadSnapshots = useCallback(async () => {
    if (isLocalDocument) {
      setSnapshots([]);
      return;
    }

    const response = await fetch(`/api/documents/${documentId}/snapshots`);

    if (response.ok) {
      const payload = (await response.json()) as { snapshots: SnapshotTimelineItem[] };
      setSnapshots(payload.snapshots);
    }
  }, [documentId, isLocalDocument]);

  useEffect(() => {
    if (isLocalDocument) {
      return;
    }

    const id = setTimeout(() => {
      void loadSnapshots();
    }, 0);

    return () => clearTimeout(id);
  }, [isLocalDocument, loadSnapshots]);

  const createSnapshot = () => {
    if (isLocalDocument) {
      return;
    }

    startTransition(async () => {
      await fetch(`/api/documents/${documentId}/snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: snapshotTitle,
          state: bytesToBase64(Y.encodeStateAsUpdate(ydoc)),
        }),
      });
      await loadSnapshots();
    });
  };

  const restoreSnapshot = (snapshotId: string) => {
    startTransition(async () => {
      const response = await fetch(`/api/documents/${documentId}/snapshots/${snapshotId}/restore`, {
        method: "POST",
      });

      if (response.ok) {
        const payload = (await response.json()) as { operation: { update: string } };
        Y.applyUpdate(ydoc, base64ToBytes(payload.operation.update), "remote");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" />
          Version History
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={snapshotTitle}
            onChange={(event) => setSnapshotTitle(event.target.value)}
            disabled={!canWrite || isLocalDocument}
          />
          <Button
            type="button"
            size="icon"
            disabled={!canWrite || pending || isLocalDocument}
            onClick={createSnapshot}
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>
        {isLocalDocument ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-300">
            Version history is available after this offline document syncs to the server.
          </p>
        ) : null}
        <div className="space-y-3">
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
              <p className="text-sm font-medium">{snapshot.title}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-300">
                {new Date(snapshot.createdAt).toLocaleString()} by {snapshot.author.email}
              </p>
              {snapshot.summary ? <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-300">{snapshot.summary}</p> : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                disabled={!canWrite || pending}
                onClick={() => restoreSnapshot(snapshot.id)}
              >
                <RotateCcw className="h-4 w-4" />
                Restore
              </Button>
            </div>
          ))}
          {snapshots.length === 0 ? <p className="text-sm text-zinc-500 dark:text-zinc-300">No snapshots yet.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
