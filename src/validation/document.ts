import { z } from "zod";

import { documentRoles } from "@/types/document";

export const MAX_YJS_UPDATE_BYTES = 256 * 1024;
export const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;

const base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Expected base64 encoded bytes");

export const documentIdSchema = z.object({
  documentId: z.string().min(8).max(128),
});

export const createDocumentSchema = z.object({
  id: z.string().startsWith("local-").max(128).optional(),
  title: z.string().trim().min(1).max(120),
});

export const renameDocumentSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export const memberRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(documentRoles.filter((role) => role !== "OWNER") as ["EDITOR", "VIEWER"]),
});

export const syncPushSchema = z.object({
  operations: z
    .array(
      z.object({
        id: z.string().uuid(),
        documentId: z.string().min(8).max(128),
        update: base64Schema,
        createdAt: z.string().datetime(),
      }),
    )
    .max(100),
});

export const syncPullSchema = z.object({
  since: z.string().datetime().optional(),
});

export const snapshotCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  state: base64Schema,
  summary: z.string().trim().max(500).optional(),
});

export const aiActionSchema = z.object({
  documentId: z.string().min(8).max(128),
  action: z.enum(["grammar", "rewrite", "summarize", "title"]),
  text: z.string().trim().min(1).max(12_000),
});

export function decodeBase64(input: string, maxBytes: number): Uint8Array {
  const bytes = Uint8Array.from(Buffer.from(input, "base64"));

  if (bytes.byteLength > maxBytes) {
    throw new Error(`Payload exceeds ${maxBytes} bytes`);
  }

  return bytes;
}

export function encodeBase64(input: Uint8Array): string {
  return Buffer.from(input).toString("base64");
}
