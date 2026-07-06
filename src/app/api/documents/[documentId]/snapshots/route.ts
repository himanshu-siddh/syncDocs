import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { assertCanWriteDocument, assertDocumentRole } from "@/server/authz";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import {
  decodeBase64,
  MAX_SNAPSHOT_BYTES,
  snapshotCreateSchema,
} from "@/validation/document";

type Params = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertDocumentRole(documentId, user.id);

    const snapshots = await prisma.documentSnapshot.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        summary: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      snapshots: snapshots.map((snapshot) => ({
        ...snapshot,
        createdAt: snapshot.createdAt.toISOString(),
        author: snapshot.user,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertCanWriteDocument(documentId, user.id);
    const body = await parseJson(request, snapshotCreateSchema);
    const state = decodeBase64(body.state, MAX_SNAPSHOT_BYTES);

    const snapshot = await prisma.documentSnapshot.create({
      data: {
        documentId,
        userId: user.id,
        title: body.title,
        summary: body.summary,
        state: Buffer.from(state),
      },
      select: {
        id: true,
        title: true,
        summary: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
