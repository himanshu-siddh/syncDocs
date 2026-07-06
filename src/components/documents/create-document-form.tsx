"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { saveDocumentMetadata } from "@/sync/document-metadata-sync";
import { upsertLocalDocument } from "@/sync/local-db";
import type { LocalDocument } from "@/types/document";

function createLocalDocument(title: string): LocalDocument {
  const now = new Date().toISOString();

  return {
    id: `local-${crypto.randomUUID()}`,
    title,
    role: "OWNER",
    createdAt: now,
    updatedAt: now,
  };
}

export function CreateDocumentForm() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  const createDocument = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    startTransition(async () => {
      if (isOnline) {
        try {
          const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: trimmedTitle }),
          });

          if (response.ok) {
            const payload = (await response.json()) as {
              document: {
                id: string;
                title: string;
                createdAt: string;
                updatedAt: string;
              };
            };
            const localDocument: LocalDocument = {
              id: payload.document.id,
              title: payload.document.title,
              role: "OWNER",
              createdAt: payload.document.createdAt,
              updatedAt: payload.document.updatedAt,
            };

            await upsertLocalDocument(localDocument);
            setTitle("");
            router.refresh();
            router.push(`/documents/${localDocument.id}`);
            return;
          }
        } catch {
          // If the network drops mid-submit, fall through to the local-first path.
        }
      }

      const localDocument = createLocalDocument(trimmedTitle);
      await saveDocumentMetadata(localDocument, { tryRemote: false });
      setTitle("");
      router.refresh();
      router.push(`/documents/${localDocument.id}`);
    });
  };

  return (
    <form onSubmit={createDocument} className="flex gap-2">
      <Input
        name="title"
        placeholder="New document title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <Button type="submit" size="icon" aria-label="Create document" disabled={pending}>
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}
