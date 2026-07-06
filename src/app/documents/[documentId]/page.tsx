import { notFound } from "next/navigation";

import { DocumentWorkspace } from "@/components/documents/document-workspace";
import { prisma } from "@/db/prisma";
import { isRetryableDatabaseError, withDatabaseRetry } from "@/db/retry";
import { requireUser } from "@/server/http";
import type { Collaborator, LocalDocument } from "@/types/document";

type PageProps = {
  params: Promise<{ documentId: string }>;
};

const colors = ["#2563eb", "#16a34a", "#9333ea", "#ea580c", "#dc2626"];

function colorForUser(userId: string) {
  const sum = [...userId].reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

export default async function DocumentPage({ params }: PageProps) {
  const user = await requireUser();
  const { documentId } = await params;

  if (documentId.startsWith("local-")) {
    const localDocument: LocalDocument = {
      id: documentId,
      title: "Untitled offline document",
      role: "OWNER",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return <DocumentWorkspace document={localDocument} initialCollaborators={[]} />;
  }

  let membership;

  try {
    membership = await withDatabaseRetry(() =>
      prisma.documentMember.findUnique({
        where: {
          documentId_userId: {
            documentId,
            userId: user.id,
          },
        },
        select: {
          role: true,
          document: {
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
              },
            },
          },
        },
      }),
    );
  } catch (error) {
    if (!isRetryableDatabaseError(error)) {
      throw error;
    }

    const fallbackDocument: LocalDocument = {
      id: documentId,
      title: "Offline document",
      role: "OWNER",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return (
      <DocumentWorkspace
        document={fallbackDocument}
        initialCollaborators={[]}
        persistMetadata={false}
      />
    );
  }

  if (!membership) {
    notFound();
  }

  const document: LocalDocument = {
    id: membership.document.id,
    title: membership.document.title,
    role: membership.role,
    createdAt: membership.document.createdAt.toISOString(),
    updatedAt: membership.document.updatedAt.toISOString(),
  };

  const collaborators: Collaborator[] = membership.document.members
    .filter((member) => member.user.id !== user.id)
    .map((member) => ({
      id: member.user.id,
      name: member.user.name ?? member.user.email,
      email: member.user.email,
      image: member.user.image,
      role: member.role,
      color: colorForUser(member.user.id),
    }));

  return <DocumentWorkspace document={document} initialCollaborators={collaborators} />;
}
