import { DocumentRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/db/prisma";
import { handleRouteError, parseJson, requireUser } from "@/server/http";
import { createDocumentSchema } from "@/validation/document";

export async function GET() {
  try {
    const user = await requireUser();
    const memberships = await prisma.documentMember.findMany({
      where: { userId: user.id },
      orderBy: { document: { updatedAt: "desc" } },
      select: {
        role: true,
        document: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      documents: memberships.map((membership) => ({
        ...membership.document,
        role: membership.role,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseJson(request, createDocumentSchema);

    if (body.id) {
      const existingMembership = await prisma.documentMember.findUnique({
        where: {
          documentId_userId: {
            documentId: body.id,
            userId: user.id,
          },
        },
        include: { document: true },
      });

      if (existingMembership) {
        const document = await prisma.document.update({
          where: { id: body.id },
          data: { title: body.title },
          include: { members: true },
        });

        return NextResponse.json({ document });
      }
    }

    const document = await prisma.document.create({
      data: {
        id: body.id,
        title: body.title,
        ownerId: user.id,
        members: {
          create: {
            userId: user.id,
            role: DocumentRole.OWNER,
          },
        },
      },
      include: {
        members: true,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
