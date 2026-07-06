import { prisma } from "@/db/prisma";
import { isRetryableDatabaseError, withDatabaseRetry } from "@/db/retry";
import type { LocalDocument } from "@/types/document";

export async function listDocumentsForUser(userId: string): Promise<LocalDocument[]> {
  const memberships = await withDatabaseRetry(() =>
    prisma.documentMember.findMany({
      where: { userId },
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
    }),
  );

  return memberships.map((membership) => ({
    id: membership.document.id,
    title: membership.document.title,
    role: membership.role,
    createdAt: membership.document.createdAt.toISOString(),
    updatedAt: membership.document.updatedAt.toISOString(),
  }));
}

export async function listDocumentsForUserOrEmpty(userId: string): Promise<LocalDocument[]> {
  try {
    return await listDocumentsForUser(userId);
  } catch (error) {
    if (isRetryableDatabaseError(error)) {
      return [];
    }

    throw error;
  }
}
