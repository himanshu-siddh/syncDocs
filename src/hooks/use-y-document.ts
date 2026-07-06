"use client";

import { useEffect, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

export function useYDocument(documentId: string) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [ydoc] = useState(() => new Y.Doc());

  useEffect(() => {
    const persistence = new IndexeddbPersistence(`document-${documentId}`, ydoc);

    persistence.once("synced", () => {
      setIsLoaded(true);
    });

    return () => {
      persistence.destroy();
      ydoc.destroy();
    };
  }, [documentId, ydoc]);

  return { ydoc, isLoaded };
}
