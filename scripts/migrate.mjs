import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is missing in environment.");
    process.exit(1);
  }

  console.log("Connecting to Supabase PostgreSQL (IPv4)...");
  // Force IPv4 family connection to avoid Windows IPv6 port 5432 timeouts
  const sql = postgres(dbUrl, {
    ssl: "require",
    max: 1,
    connect_timeout: 15,
    fetch_types: false,
  });

  const sqlFilePath = path.resolve(__dirname, "../packages/shared/drizzle/0000_narrow_revanche.sql");
  const sqlContent = fs.readFileSync(sqlFilePath, "utf8");

  console.log("Executing SQL migration on Supabase...");
  await sql.unsafe(sqlContent);
  console.log("✓ SUCCESS: All 10 tables, indexes, foreign keys, and vector extension created on Supabase!");

  await sql.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
