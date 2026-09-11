import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Use unpooled direct database connection for Prisma migrations to prevent
// advisory-lock timeouts (P1002) in transaction-pooled environments like PgBouncer / Neon.
function resolveMigrationDatasourceUrl(): string {
  if (process.env.DIRECT_URL) return process.env.DIRECT_URL;
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  if (process.env.POSTGRES_URL_NON_POOLING) return process.env.POSTGRES_URL_NON_POOLING;
  
  const dbUrl = process.env.DATABASE_URL || "";
  // Neon pooled endpoints contain '-pooler.'; stripping it routes directly to the compute instance
  if (dbUrl.includes("-pooler.")) {
    return dbUrl.replace("-pooler.", ".");
  }
  return dbUrl;
}

const migrationDatasourceUrl = resolveMigrationDatasourceUrl();

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
