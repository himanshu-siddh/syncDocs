import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 keeps environment-specific datasource values in config, while the
// schema remains portable across local development, CI, and Vercel.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
