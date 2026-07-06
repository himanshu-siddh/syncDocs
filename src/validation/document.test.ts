import { describe, expect, it } from "vitest";

import {
  MAX_YJS_UPDATE_BYTES,
  decodeBase64,
  syncPushSchema,
} from "@/validation/document";

describe("document validation", () => {
  it("accepts bounded Yjs sync operations", () => {
    const operation = {
      id: crypto.randomUUID(),
      documentId: "document-123",
      update: btoa("valid-update"),
      createdAt: new Date().toISOString(),
    };

    expect(syncPushSchema.parse({ operations: [operation] }).operations).toHaveLength(1);
  });

  it("rejects malformed base64 sync payloads", () => {
    expect(() =>
      syncPushSchema.parse({
        operations: [
          {
            id: crypto.randomUUID(),
            documentId: "document-123",
            update: "not base64 ***",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects oversized decoded payloads", () => {
    const oversized = Buffer.alloc(MAX_YJS_UPDATE_BYTES + 1).toString("base64");

    expect(() => decodeBase64(oversized, MAX_YJS_UPDATE_BYTES)).toThrow(/exceeds/);
  });
});
