/**
 * Apply a .sql file to the control plane.
 *
 *   node scripts/apply-sql.mjs packages/shared/drizzle/policies/009_command_spine.sql
 *
 * Exists because `packages/shared/drizzle/policies/README.md` tells you to use
 * `psql`, and psql is not installed on the Windows box this factory runs on.
 * Every file in that directory is written to be idempotent, so re-running one is
 * safe and is in fact how you check that it is.
 *
 * Uses DATABASE_URL — the direct Postgres connection, for migrations only.
 * Application code must never reach the control plane this way: this connects
 * as the owner role, which bypasses RLS (AGENTS.md §4).
 */
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <path-to-sql>");
  process.exit(1);
}

// .env is not loaded automatically outside Next, and this script runs under bare
// node. Parsed rather than depending on dotenv, which is not a root dependency.
if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set, and .env did not supply one.");
  process.exit(1);
}

const sqlPath = path.resolve(file);
const contents = fs.readFileSync(sqlPath, "utf8");

// max: 1 and forced SSL match scripts/migrate.mjs — the Supabase pooler rejects
// unencrypted connections, and a single connection keeps statement order
// deterministic.
const sql = postgres(dbUrl, { ssl: "require", max: 1, connect_timeout: 15, fetch_types: false });

try {
  console.log(`applying ${path.basename(sqlPath)} …`);
  await sql.unsafe(contents);
  console.log(`✓ applied ${path.basename(sqlPath)}`);
} catch (err) {
  // Print the whole thing. A truncated Postgres error hides the position and
  // the hint, which are usually the entire diagnosis (AGENTS.md §3.4).
  console.error("✗ failed:", err.message);
  if (err.position) console.error("  position:", err.position);
  if (err.detail) console.error("  detail:", err.detail);
  if (err.hint) console.error("  hint:", err.hint);
  if (err.where) console.error("  where:", err.where);
  process.exitCode = 1;
} finally {
  await sql.end();
}
