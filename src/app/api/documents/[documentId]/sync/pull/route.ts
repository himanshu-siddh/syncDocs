import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { assertDocumentRole } from "@/server/authz";
import { handleRouteError, requireUser } from "@/server/http";
import { encodeBase64, syncPullSchema } from "@/validation/document";

type Params = {
  params: Promise<{ documentId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertDocumentRole(documentId, user.id);

    const url = new URL(request.url);
    const query = syncPullSchema.parse({
      since: url.searchParams.get("since") ?? undefined,
    });

    const operations = await prisma.syncOperation.findMany({
      where: {
        documentId,
        createdAt: query.since ? { gt: new Date(query.since) } : undefined,
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        documentId: true,
        payload: true,
        createdAt: true,
        userId: true,
      },
    });

    return NextResponse.json({
      operations: operations.map((operation) => ({
        id: operation.id,
        documentId: operation.documentId,
        userId: operation.userId,
        update: encodeBase64(operation.payload),
        createdAt: operation.createdAt.toISOString(),
      })),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
