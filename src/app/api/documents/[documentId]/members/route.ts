import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { assertCanOwnDocument } from "@/server/authz";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import { memberRoleSchema } from "@/validation/document";

type Params = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { documentId } = await params;
    await assertCanOwnDocument(documentId, user.id);
    const body = await parseJson(request, memberRoleSchema);

    const member = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      select: { id: true },
    });

    if (!member) {
      return new Response("User does not exist", { status: 404 });
    }

    const membership = await prisma.documentMember.upsert({
      where: {
        documentId_userId: {
          documentId,
          userId: member.id,
        },
      },
      update: {
        role: body.role,
      },
      create: {
        documentId,
        userId: member.id,
        role: body.role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });

    return NextResponse.json({ membership });
  } catch (error) {
    return handleRouteError(error);
  }
}
