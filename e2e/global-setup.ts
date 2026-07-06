import { execSync } from "node:child_process";

import { cleanupTestData, disconnectTestPrisma, getTestPrisma } from "./helpers/test-db";

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set before running Playwright sync tests.");
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });

  getTestPrisma();
  await cleanupTestData();
  await disconnectTestPrisma();
}
