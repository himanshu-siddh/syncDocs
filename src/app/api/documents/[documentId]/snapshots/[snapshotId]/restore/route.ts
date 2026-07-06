import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { assertCanWriteDocument } from "@/server/authz";
import { handleRouteError, requireUser } from "@/server/http";
import { encodeBase64 } from "@/validation/document";

type Params = {
  params: Promise<{ documentId: string; snapshotId: string }>;
};

export async function POST(_: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId, snapshotId } = await params;
    await assertCanWriteDocument(documentId, user.id);

    const snapshot = await prisma.documentSnapshot.findFirst({
      where: { id: snapshotId, documentId },
      select: { state: true },
    });

    if (!snapshot) {
      return new Response("Snapshot not found", { status: 404 });
    }

    const operation = await prisma.syncOperation.create({
      data: {
        id: randomUUID(),
        documentId,
        userId: user.id,
        payload: snapshot.state,
      },
      select: {
        id: true,
        documentId: true,
        payload: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      operation: {
        id: operation.id,
        documentId: operation.documentId,
        update: encodeBase64(operation.payload),
        createdAt: operation.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
