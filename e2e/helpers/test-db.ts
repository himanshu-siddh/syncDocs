import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import type { DocumentRole } from "../../src/types/document";

let prisma: PrismaClient | undefined;

export function getTestPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Playwright sync tests.");
  }

  if (!prisma) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}

export async function disconnectTestPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

export async function cleanupTestData() {
  const db = getTestPrisma();
  await db.user.deleteMany({
    where: {
      email: {
        endsWith: "@test.local",
      },
    },
  });
}

export type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

export async function createTestUser(name: string, email: string, password = "Password123!"): Promise<TestUser> {
  const db = getTestPrisma();
  const user = await db.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await hash(password, 12),
    },
    select: { id: true, email: true, name: true },
  });

  return {
    id: user.id,
    email: user.email,
    password,
    name: user.name ?? name,
  };
}

export async function createDocumentForUser(
  owner: TestUser,
  title: string,
): Promise<{ documentId: string }> {
  const db = getTestPrisma();
  const document = await db.document.create({
    data: {
      title,
      ownerId: owner.id,
      members: {
        create: {
          userId: owner.id,
          role: "OWNER" satisfies DocumentRole,
        },
      },
    },
    select: { id: true },
  });

  return { documentId: document.id };
}

export async function addDocumentMember(
  documentId: string,
  user: TestUser,
  role: Exclude<DocumentRole, "OWNER">,
) {
  const db = getTestPrisma();
  await db.documentMember.create({
    data: {
      documentId,
      userId: user.id,
      role,
    },
  });
}

export async function countSyncOperations(documentId: string) {
  const db = getTestPrisma();
  return db.syncOperation.count({ where: { documentId } });
}

export async function countSnapshots(documentId: string) {
  const db = getTestPrisma();
  return db.documentSnapshot.count({ where: { documentId } });
}
