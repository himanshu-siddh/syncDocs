import { prisma } from "@/db/prisma";
import type { DocumentRole } from "@/types/document";

const writeRoles = new Set<DocumentRole>(["OWNER", "EDITOR"]);

export async function getDocumentRole(documentId: string, userId: string) {
  const membership = await prisma.documentMember.findUnique({
    where: {
      documentId_userId: {
        documentId,
        userId,
      },
    },
    select: {
      role: true,
    },
  });

  return membership?.role ?? null;
}

export async function assertDocumentRole(documentId: string, userId: string) {
  const role = await getDocumentRole(documentId, userId);

  if (!role) {
    throw new Response("Document not found", { status: 404 });
  }

  return role;
}

export async function assertCanWriteDocument(documentId: string, userId: string) {
  const role = await assertDocumentRole(documentId, userId);

  if (!writeRoles.has(role)) {
    throw new Response("Viewer role cannot modify this document", { status: 403 });
  }

  return role;
}

export async function assertCanOwnDocument(documentId: string, userId: string) {
  const role = await assertDocumentRole(documentId, userId);

  if (role !== "OWNER") {
    throw new Response("Only the owner can manage document access", { status: 403 });
  }

  return role;
}

export function canWrite(role: DocumentRole | null | undefined) {
  return role ? writeRoles.has(role) : false;
}
