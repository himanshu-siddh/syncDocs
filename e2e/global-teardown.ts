import { cleanupTestData, disconnectTestPrisma } from "./helpers/test-db";

export default async function globalTeardown() {
  await cleanupTestData();
  await disconnectTestPrisma();
}
