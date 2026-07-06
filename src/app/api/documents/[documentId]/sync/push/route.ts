import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { assertCanWriteDocument } from "@/server/authz";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import {
  decodeBase64,
  MAX_YJS_UPDATE_BYTES,
  syncPushSchema,
} from "@/validation/document";

type Params = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertCanWriteDocument(documentId, user.id);
    const body = await parseJson(request, syncPushSchema);

    const operations = body.operations.map((operation) => {
      if (operation.documentId !== documentId) {
        throw new Response("Operation document mismatch", { status: 400 });
      }

      return {
        id: operation.id,
        documentId,
        userId: user.id,
        payload: Buffer.from(decodeBase64(operation.update, MAX_YJS_UPDATE_BYTES)),
        createdAt: new Date(operation.createdAt),
      };
    });

    if (operations.length > 0) {
      await prisma.$transaction([
        prisma.syncOperation.createMany({
          data: operations,
          skipDuplicates: true,
        }),
        prisma.document.update({
          where: { id: documentId },
          data: { updatedAt: new Date() },
        }),
      ]);
    }

    return NextResponse.json({
      accepted: operations.map((operation) => operation.id),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
