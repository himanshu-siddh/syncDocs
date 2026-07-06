"use client";

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";

import { AiAssistantPanel } from "@/components/documents/ai-assistant-panel";
import { CollaboratorsPanel } from "@/components/documents/collaborators-panel";
import { StatusBar } from "@/components/documents/status-bar";
import { VersionHistory } from "@/components/documents/version-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/editor/rich-text-editor";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSyncEngine } from "@/hooks/use-sync-engine";
import { useYDocument } from "@/hooks/use-y-document";
import { saveDocumentMetadata } from "@/sync/document-metadata-sync";
import { localDb } from "@/sync/local-db";
import type { Collaborator, LocalDocument } from "@/types/document";

type DocumentWorkspaceProps = {
  document: LocalDocument;
  initialCollaborators: Collaborator[];
  persistMetadata?: boolean;
};

export function DocumentWorkspace({
  document,
  initialCollaborators,
  persistMetadata = true,
}: DocumentWorkspaceProps) {
  const [title, setTitle] = useState(document.title);
  const [lastSavedTitle, setLastSavedTitle] = useState(document.title);
  const [editor, setEditor] = useState<Editor | null>(null);
  const isOnline = useOnlineStatus();
  const { ydoc, isLoaded } = useYDocument(document.id);
  const canWrite = document.role === "OWNER" || document.role === "EDITOR";
  const sync = useSyncEngine({
    documentId: document.id,
    title,
    ydoc,
    canWrite,
    isOnline,
  });

  useEffect(() => {
    if (!persistMetadata) {
      return;
    }

    let cancelled = false;
    const id = setTimeout(() => {
      void localDb.documents.get(document.id).then((localDocument) => {
        if (!cancelled && localDocument) {
          setTitle(localDocument.title);
          setLastSavedTitle(localDocument.title);
        }
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [document.id, persistMetadata]);

  const saveTitle = async (nextTitle: string) => {
    const cleanTitle = nextTitle.trim() || "Untitled";
    setTitle(cleanTitle);

    if (cleanTitle === lastSavedTitle) {
      return;
    }

    if (persistMetadata) {
      await saveDocumentMetadata(
        {
          ...document,
          title: cleanTitle,
          updatedAt: new Date().toISOString(),
        },
        { tryRemote: isOnline && canWrite },
      );
    }

    setLastSavedTitle(cleanTitle);
  };

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_360px] gap-6 overflow-hidden p-6">
      <section className="min-w-0 space-y-4 overflow-y-auto">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-600 dark:bg-zinc-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void saveTitle(title)}
              disabled={!canWrite}
              className="border-none px-0 text-2xl font-semibold text-zinc-950 shadow-none focus:ring-0 disabled:bg-white disabled:text-zinc-950 dark:text-zinc-50 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-50"
            />
            <StatusBar isOnline={isOnline} syncStatus={sync.status} />
          </div>
        </div>
        {isLoaded ? (
          <RichTextEditor ydoc={ydoc} editable={canWrite} onEditorReady={setEditor} />
        ) : (
          <div className="min-h-[60vh] rounded-xl border border-zinc-200 bg-white p-6 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100">
            Loading local document...
          </div>
        )}
      </section>
      <aside className="space-y-4 overflow-y-auto">
        <CollaboratorsPanel collaborators={initialCollaborators} />
        <VersionHistory documentId={document.id} ydoc={ydoc} canWrite={canWrite && isOnline} />
        <AiAssistantPanel
          documentId={document.id}
          editor={editor}
          canWrite={canWrite}
          onTitleGenerated={(nextTitle) => void saveTitle(nextTitle)}
        />
        <Button variant="outline" className="w-full" onClick={() => void sync.flushQueuedOperations()}>
          Sync now
        </Button>
      </aside>
    </div>
  );
}
