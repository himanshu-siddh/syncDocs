"use server";

import { DocumentRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/db/prisma";
import { requireUser } from "@/server/http";
import { createDocumentSchema, renameDocumentSchema } from "@/validation/document";
import { assertCanWriteDocument } from "@/server/authz";

export async function createDocumentAction(formData: FormData) {
  const user = await requireUser();
  const parsed = createDocumentSchema.parse({
    title: formData.get("title"),
  });

  const document = await prisma.document.create({
    data: {
      title: parsed.title,
      ownerId: user.id,
      members: {
        create: {
          userId: user.id,
          role: DocumentRole.OWNER,
        },
      },
    },
    select: {
      id: true,
    },
  });

  revalidatePath("/documents");
  redirect(`/documents/${document.id}`);
}

export async function renameDocumentAction(documentId: string, formData: FormData) {
  const user = await requireUser();
  await assertCanWriteDocument(documentId, user.id);

  const parsed = renameDocumentSchema.parse({
    title: formData.get("title"),
  });

  await prisma.document.update({
    where: { id: documentId },
    data: { title: parsed.title },
  });

  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
}
