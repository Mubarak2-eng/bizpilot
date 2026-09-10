import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Use unpooled direct database connection for Prisma migrations to prevent
// advisory-lock timeouts (P1002) in transaction-pooled environments like PgBouncer / Neon.
// Falls back to DATABASE_URL for local development and environments without a dedicated direct URL.
const migrationDatasourceUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationDatasourceUrl || env("DATABASE_URL"),
  },
});
