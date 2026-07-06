export const documentRoles = ["OWNER", "EDITOR", "VIEWER"] as const;

export type DocumentRole = (typeof documentRoles)[number];

export type SyncStatus = "idle" | "offline" | "syncing" | "synced" | "error";

export type LocalDocument = {
  id: string;
  title: string;
  role: DocumentRole;
  updatedAt: string;
  createdAt: string;
};

export type Collaborator = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: DocumentRole;
  color: string;
};

export type SnapshotTimelineItem = {
  id: string;
  title: string;
  summary?: string | null;
  createdAt: string;
  author: {
    name: string | null;
    email: string;
  };
};

export type QueuedOperation = {
  id: string;
  documentId: string;
  update: Uint8Array;
  createdAt: string;
};

export type PendingDeletedDocument = {
  documentId: string;
  title: string;
  deletedAt: string;
};

export type PendingDocumentWrite = {
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
