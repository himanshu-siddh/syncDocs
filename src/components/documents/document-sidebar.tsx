"use client";

import Link from "next/link";
import Image from "next/image";
import { FileText, Trash2 } from "lucide-react";
import { liveQuery } from "dexie";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { logoutAction } from "@/actions/auth";
import { CreateDocumentForm } from "@/components/documents/create-document-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { flushDocumentMetadataWrites } from "@/sync/document-metadata-sync";
import {
  deleteLocalDocument,
  getPendingDeletedDocuments,
  localDb,
  queueDeletedDocument,
  removeDeletedDocument,
} from "@/sync/local-db";
import type { LocalDocument, PendingDeletedDocument } from "@/types/document";

type DocumentSidebarProps = {
  documents: LocalDocument[];
  activeDocumentId?: string;
  userName: string;
};

function getDocumentIdFromPathname(pathname: string) {
  const [, section, documentId] = pathname.split("/");

  if (section !== "documents" || !documentId) {
    return undefined;
  }

  return decodeURIComponent(documentId);
}

export function DocumentSidebar({ documents, activeDocumentId, userName }: DocumentSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [localDocuments, setLocalDocuments] = useState<LocalDocument[]>([]);
  const [clickedDocumentId, setClickedDocumentId] = useState<string | undefined>();
  const [deletedDocumentIds, setDeletedDocumentIds] = useState<Set<string>>(() => new Set());
  const [pendingDeletedDocuments, setPendingDeletedDocuments] = useState<PendingDeletedDocument[]>([]);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | undefined>();
  const [documentToDelete, setDocumentToDelete] = useState<LocalDocument | undefined>();
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const pathDocumentId = getDocumentIdFromPathname(pathname);
  const currentDocumentId = activeDocumentId ?? clickedDocumentId ?? pathDocumentId;
  const mergedDocuments = useMemo(() => {
    const documentsById = new Map<string, LocalDocument>();
    const hiddenDocumentIds = new Set([
      ...deletedDocumentIds,
      ...pendingDeletedDocuments.map((document) => document.documentId),
    ]);

    // IndexedDB is the local-first source of truth; server props fill any gaps
    // before the next bulkPut/liveQuery cycle (e.g. right after create).
    localDocuments.forEach((document) => {
      documentsById.set(document.id, document);
    });

    documents.forEach((document) => {
      if (!documentsById.has(document.id)) {
        documentsById.set(document.id, document);
      }
    });

    return [...documentsById.values()]
      .filter((document) => !hiddenDocumentIds.has(document.id))
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
  }, [deletedDocumentIds, documents, localDocuments, pendingDeletedDocuments]);

  useEffect(() => {
    const id = setTimeout(() => setClickedDocumentId(undefined), 0);

    return () => clearTimeout(id);
  }, [pathDocumentId]);

  useEffect(() => {
    if (documents.length > 0) {
      void localDb.documents.bulkPut(documents);
    }
  }, [documents]);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [storedDocuments, pendingWrites] = await Promise.all([
        localDb.documents.toArray(),
        localDb.pendingDocumentWrites.toArray(),
      ]);
      const documentsById = new Map(storedDocuments.map((document) => [document.id, document]));

      for (const pendingWrite of pendingWrites) {
        if (!documentsById.has(pendingWrite.documentId)) {
          documentsById.set(pendingWrite.documentId, {
            id: pendingWrite.documentId,
            title: pendingWrite.title,
            role: "OWNER",
            createdAt: pendingWrite.createdAt,
            updatedAt: pendingWrite.updatedAt,
          });
        }
      }

      return [...documentsById.values()];
    }).subscribe({
      next: setLocalDocuments,
      error: () => setLocalDocuments([]),
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const subscription = liveQuery(() => localDb.deletedDocuments.toArray()).subscribe({
      next: setPendingDeletedDocuments,
      error: () => setPendingDeletedDocuments([]),
    });

    return () => subscription.unsubscribe();
  }, []);

  const flushPendingDeletes = useCallback(async () => {
    if (!navigator.onLine) {
      return;
    }

    await flushDocumentMetadataWrites();
    const pendingDeletes = await getPendingDeletedDocuments();

    for (const pendingDelete of pendingDeletes) {
      const response = await fetch(`/api/documents/${pendingDelete.documentId}`, {
        method: "DELETE",
      });

      if (response.ok || response.status === 404) {
        await removeDeletedDocument(pendingDelete.documentId);
        setDeletedDocumentIds((current) => new Set(current).add(pendingDelete.documentId));
      }
    }

    if (pendingDeletes.length > 0) {
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    const id = setTimeout(() => {
      void flushPendingDeletes();
    }, 0);
    const handleOnline = () => {
      void flushPendingDeletes();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      clearTimeout(id);
      window.removeEventListener("online", handleOnline);
    };
  }, [flushPendingDeletes]);

  const deleteDocument = async (document: LocalDocument) => {
    setDeleteError(undefined);
    setDeletingDocumentId(document.id);

    try {
      let shouldQueueServerDelete = !navigator.onLine;

      if (navigator.onLine) {
        try {
          const response = await fetch(`/api/documents/${document.id}`, {
            method: "DELETE",
          });

          // local-* documents may or may not have been promoted to Postgres.
          // 404 means it only existed locally, so local cleanup is enough.
          if (!response.ok && response.status !== 404) {
            throw new Error("Unable to delete document");
          }
        } catch (error) {
          if (navigator.onLine && !(error instanceof TypeError)) {
            throw error;
          }

          shouldQueueServerDelete = true;
        }
      }

      if (shouldQueueServerDelete) {
        await queueDeletedDocument({
          documentId: document.id,
          title: document.title,
          deletedAt: new Date().toISOString(),
        });
      } else {
        await removeDeletedDocument(document.id);
      }

      await deleteLocalDocument(document.id);
      setDeletedDocumentIds((current) => new Set(current).add(document.id));

      if (currentDocumentId === document.id) {
        router.push("/documents");
      }

      router.refresh();
      setDocumentToDelete(undefined);
    } catch {
      setDeleteError("Could not delete this document. Check your connection and permissions.");
    } finally {
      setDeletingDocumentId(undefined);
    }
  };

  return (
    <>
    <aside className="flex h-screen w-96 shrink-0 flex-col border-r border-zinc-200 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50">
      <div className="space-y-4 border-b border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
              Workspace
            </p>
            <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-950 dark:text-zinc-50">
              <Image src="/syncdocs-icon.svg" alt="" width={28} height={28} />
              SyncDocs
            </h1>
            <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {userName}
            </p>
          </div>
          <ThemeToggle />
        </div>
        <CreateDocumentForm />
      </div>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-3">
          {mergedDocuments.map((document) => {
            const isActive = currentDocumentId === document.id;

            return (
              <div
                key={document.id}
                className={cn(
                  "group flex items-start gap-2 rounded-lg text-sm text-zinc-950 transition-colors hover:bg-zinc-100 dark:text-zinc-50 dark:hover:bg-zinc-700",
                  isActive &&
                    "bg-zinc-200 text-zinc-950 shadow-sm ring-1 ring-zinc-300 hover:bg-zinc-200 dark:bg-zinc-600 dark:text-zinc-50 dark:ring-zinc-500 dark:hover:bg-zinc-600",
                )}
              >
                <Link
                  href={`/documents/${document.id}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setClickedDocumentId(document.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3"
                >
                  <FileText
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0 text-zinc-700 dark:text-zinc-300",
                      isActive && "text-zinc-950 dark:text-zinc-50",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate font-semibold text-zinc-950 dark:text-zinc-50",
                        isActive && "text-zinc-950 dark:text-zinc-50",
                      )}
                    >
                      {document.title}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-medium text-zinc-700 dark:text-zinc-300",
                        isActive && "text-zinc-800 dark:text-zinc-200",
                      )}
                    >
                      {new Date(document.updatedAt).toLocaleString()}
                    </span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-1 py-2 pr-2">
                  <Badge
                    variant="secondary"
                    className={cn(isActive && "bg-zinc-300 text-zinc-950 dark:bg-zinc-500 dark:text-zinc-50")}
                  >
                    {document.role.toLowerCase()}
                  </Badge>
                  <button
                    type="button"
                    aria-label={`Delete ${document.title}`}
                    disabled={deletingDocumentId === document.id}
                    onClick={() => {
                      setDeleteError(undefined);
                      setDocumentToDelete(document);
                    }}
                    className="rounded-md p-1.5 text-zinc-700 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-red-950 dark:hover:text-red-200"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
          {mergedDocuments.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Create your first document to begin editing offline.
            </p>
          ) : null}
        </nav>
      </ScrollArea>
      <form action={logoutAction} className="border-t border-zinc-200 p-4 dark:border-zinc-700">
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </aside>
    {documentToDelete ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-document-title"
      >
        <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-xl dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50">
          <h2 id="delete-document-title" className="text-lg font-semibold">
            Delete document?
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            This will permanently delete &quot;{documentToDelete.title}&quot;. This action cannot be undone.
          </p>
          {deleteError ? <p className="mt-3 text-sm text-red-600 dark:text-red-300">{deleteError}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={deletingDocumentId === documentToDelete.id}
              onClick={() => {
                setDeleteError(undefined);
                setDocumentToDelete(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingDocumentId === documentToDelete.id}
              onClick={() => void deleteDocument(documentToDelete)}
            >
              {deletingDocumentId === documentToDelete.id ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
