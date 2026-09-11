const { Client } = require("pg");
const { execSync } = require("child_process");
require("dotenv").config();

async function run() {
  const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
  const directUrl = rawUrl.replace("-pooler.", ".");

  if (directUrl && (directUrl.startsWith("postgres://") || directUrl.startsWith("postgresql://"))) {
    try {
      const client = new Client({
        connectionString: directUrl,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      await client.query("SELECT pg_advisory_unlock_all()");
      await client.end();
    } catch (e) {
      // Non-fatal if DB is cold starting
      console.warn("[Deploy Helper] Pre-migration advisory unlock note:", e.message);
    }
  }

  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
  } catch (err) {
    console.error("[Deploy Helper] Migration execution failed:", err.message);
    process.exit(1);
  }
}

run();