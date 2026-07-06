import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { assertCanOwnDocument, assertDocumentRole, assertCanWriteDocument } from "@/server/authz";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import { renameDocumentSchema } from "@/validation/document";

type Params = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertDocumentRole(documentId, user.id);

    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ document });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertCanWriteDocument(documentId, user.id);
    const body = await parseJson(request, renameDocumentSchema);

    const document = await prisma.document.update({
      where: { id: documentId },
      data: { title: body.title },
      select: { id: true, title: true, updatedAt: true },
    });

    return NextResponse.json({ document });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertCanOwnDocument(documentId, user.id);

    await prisma.document.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
