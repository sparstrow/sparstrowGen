#!/usr/bin/env node
/**
 * Apply named SQL files to the control plane, in one transaction.
 *
 *   node packages/shared/drizzle/apply-pending.mjs \
 *     packages/shared/drizzle/0011_machines_and_access_tokens.sql \
 *     packages/shared/drizzle/0012_drop_workspace_scoped_daemon_tokens.sql \
 *     packages/shared/drizzle/policies/033_machines_and_access_tokens.sql
 *
 * Add `--dry-run` to apply everything and then roll back, which type-checks the
 * SQL against the real schema without changing anything.
 *
 * ─── Why this exists, when `policies/README.md` says to use drizzle-kit ───────
 *
 * It says:
 *
 *     npx drizzle-kit migrate --config=packages/shared/drizzle.config.ts
 *
 * That does not work against staging, and has not for a long time. Checked
 * 2026-09-02: `drizzle.__drizzle_migrations` on the staging project
 * (`pnymngoqseltgigcfevq`) holds **zero rows**, while `public` holds 42 tables.
 * Staging was built by pasting `apply-to-supabase.sql`, not by running the
 * migration sequence, so drizzle believes nothing has ever been applied.
 * `drizzle-kit migrate` would therefore start at `0000` and abort on the first
 * `CREATE TABLE "agent_instances"` — already exists.
 *
 * The same is true of any environment bootstrapped from that bundle. Until
 * someone backfills the journal (see `doc/KnownGaps.md` G-60), applying a new
 * migration to an existing database means running its SQL directly — which is
 * what this script does, with the two things `psql -f` does not give you:
 *
 *   1. **One transaction across every file.** Postgres DDL is transactional, so
 *      a failure in file 3 rolls back files 1 and 2 rather than leaving the
 *      database half-migrated. Applying 0011 without 0012 leaves
 *      `runtimes.machine_id` nullable and every machine unclaimable; that state
 *      should never exist, not even briefly.
 *   2. **A post-condition check inside the transaction.** Migration 0012
 *      backfills a `machines` row per existing runtime before tightening
 *      `machine_id` to `NOT NULL`. If any runtime came out without one, this
 *      throws and the whole thing rolls back.
 *
 * `psql` is also simply not present on the maintainer's Windows machine, which
 * is how this gap went unnoticed.
 *
 * Not a general migration runner, deliberately. It records nothing in the
 * journal, because writing to a journal that is already wrong would make the
 * problem harder to see rather than easier.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "../../..");

/**
 * pnpm does not hoist, and this script has no package of its own, so resolve
 * `postgres` from the workspace root's store rather than assuming a flat
 * `node_modules`.
 */
function loadPostgres() {
  try {
    return require("postgres");
  } catch {
    const store = path.join(repoRoot, "node_modules/.pnpm");
    const dir = fs
      .readdirSync(store)
      .find((d) => d.startsWith("postgres@") && !d.startsWith("postgres-"));
    if (!dir) throw new Error("could not find the `postgres` package — run `pnpm install` first");
    return require(path.join(store, dir, "node_modules/postgres"));
  }
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = path.join(repoRoot, "apps/web/.env.local");
  if (!fs.existsSync(envFile)) {
    throw new Error("set DATABASE_URL, or create apps/web/.env.local with it");
  }
  const match = fs.readFileSync(envFile, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
  if (!match) throw new Error("apps/web/.env.local has no DATABASE_URL");
  return match[1];
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const files = args.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error("usage: node apply-pending.mjs [--dry-run] <file.sql> [file.sql ...]");
  process.exit(2);
}

const postgres = loadPostgres();
const sql = postgres(databaseUrl(), { ssl: "require", max: 1 });

/** `--> statement-breakpoint` is drizzle's own separator, meaningless to Postgres. */
const strip = (text) => text.replaceAll("--> statement-breakpoint", "");

class Rollback extends Error {}

try {
  console.log(dryRun ? "DRY RUN — everything below is rolled back at the end.\n" : "");

  await sql.begin(async (tx) => {
    for (const file of files) {
      process.stdout.write(`  ${path.basename(file)} ... `);
      await tx.unsafe(strip(fs.readFileSync(path.resolve(repoRoot, file), "utf8")));
      console.log("ok");
    }

    // Post-conditions, inside the transaction so a failure rolls everything
    // back. Only checked when the tables they concern actually exist, so this
    // script stays usable for unrelated SQL.
    const hasRuntimes = await tx`
      select 1 from information_schema.columns
      where table_schema='public' and table_name='runtimes' and column_name='machine_id'`;

    if (hasRuntimes.length) {
      const [{ orphans }] = await tx`
        select count(*)::int as orphans from public.runtimes where machine_id is null`;
      if (orphans > 0) {
        throw new Error(`${orphans} runtime(s) ended with no machine_id — rolling back`);
      }
      const machines = await tx`select id, user_id, name, hostname from public.machines`;
      const runtimes = await tx`select id, machine_id, workspace_id from public.runtimes`;
      console.log(`\n  machines: ${machines.length}`);
      for (const m of machines) console.log(`    ${m.id}  ${m.name} (${m.hostname})`);
      console.log(`  runtimes: ${runtimes.length}`);
      for (const r of runtimes) console.log(`    ${r.id}  -> machine ${r.machine_id}`);
    }

    if (dryRun) throw new Rollback("dry run");
  });

  console.log("\nCOMMITTED");
} catch (err) {
  if (err instanceof Rollback) {
    console.log("\nROLLED BACK (dry run) — the SQL is valid against the live schema.");
  } else {
    console.error(`\nFAILED — rolled back, database unchanged:\n  ${err.message}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
