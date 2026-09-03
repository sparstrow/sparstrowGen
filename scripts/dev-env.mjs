#!/usr/bin/env node
/**
 * dev-env — one command to get a working local environment.
 *
 * Usage:  pnpm dev:up | dev:down | dev:status | dev:env | db:reset
 *
 * ─── Why the `dev:` prefix ────────────────────────────────────────────────
 *
 * `up` and `env` are pnpm BUILT-IN commands, and a built-in always wins over a
 * package script of the same name. `pnpm up` is an alias for `pnpm update`, so
 * the obvious name for "start my environment" would instead have silently
 * upgraded every dependency in the monorepo; `pnpm env` manages Node versions
 * and just printed its own help. Both were caught by running them.
 *
 * Do not un-prefix these. The short name is not available, however much it
 * reads better.
 *
 * ─── Why this is a Node script and not a Makefile ──────────────────────────
 *
 * Multica drives its local environment from a Makefile, and the restructure
 * plan said we would copy that. We are not, deliberately.
 *
 * `make` is not installed on this project's development machine (Windows;
 * Git Bash ships no make), and this repo is TypeScript-only — Node is the one
 * runtime guaranteed to be present, because nothing in the repo builds
 * without it. Multica needs a Makefile because it drives a Go toolchain
 * alongside a pnpm workspace; we have no second toolchain to coordinate.
 *
 * Shipping a Makefile nobody on this machine can run would be exactly the
 * kind of aspirational artifact this restructure exists to remove. The
 * architecture is what we are copying from multica, not the skin.
 *
 * ─── What it does ─────────────────────────────────────────────────────────
 *
 * `up` brings up local Supabase in Docker, then writes the real local
 * credentials into the env files the apps read, so that starting the app
 * never requires copying an anon key out of terminal output by hand. That
 * copy step is small, but it is done wrong once per machine and the failure
 * looks like a code bug.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";

const say = (msg) => console.log(msg);
const step = (msg) => console.log(`${BOLD}==>${RESET} ${msg}`);
const ok = (msg) => console.log(`${GREEN}✓${RESET} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}!${RESET} ${msg}`);
const fail = (msg) => console.error(`${RED}✗${RESET} ${msg}`);

const isWindows = process.platform === "win32";

/**
 * Build the single command string used when spawning through a shell.
 *
 * We need `shell: true` on Windows because `supabase` and `pnpm` are installed
 * as `.cmd` shims, which CreateProcess cannot execute directly. But passing an
 * args ARRAY together with `shell: true` triggers Node's DEP0190 warning —
 * the args are concatenated rather than escaped, so a value containing shell
 * metacharacters would be interpreted. Every argument in this file is a
 * hardcoded literal, so there is no injection risk here, but a dev script that
 * prints a deprecation warning on every run teaches people to stop reading its
 * output. Joining and quoting ourselves keeps the shell and loses the warning.
 */
function shellCommand(cmd, args) {
  const quote = (a) => (/^[A-Za-z0-9_.:\/\\-]+$/.test(a) ? a : `"${a.replace(/"/g, '\\"')}"`);
  return [cmd, ...args.map(quote)].join(" ");
}

/** Run a command, inheriting stdio. Returns the exit code. */
function run(cmd, args, opts = {}) {
  const res = isWindows
    ? spawnSync(shellCommand(cmd, args), { cwd: repoRoot, stdio: "inherit", shell: true, ...opts })
    : spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit", ...opts });
  return res.status ?? 1;
}

/** Run a command and capture stdout+stderr. Returns { code, out }. */
function capture(cmd, args, opts = {}) {
  const res = isWindows
    ? spawnSync(shellCommand(cmd, args), { cwd: repoRoot, encoding: "utf8", shell: true, ...opts })
    : spawnSync(cmd, args, { cwd: repoRoot, encoding: "utf8", ...opts });
  return { code: res.status ?? 1, out: (res.stdout ?? "") + (res.stderr ?? "") };
}

/**
 * Docker Desktop being installed is not the same as its daemon running, and
 * the difference produces a wall of unrelated Supabase output. Check first and
 * say the one useful sentence instead.
 */
function requireDocker() {
  const { code } = capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (code !== 0) {
    fail("Docker is not running.");
    say("");
    say("  Local Supabase runs in Docker. Start Docker Desktop and wait for it");
    say("  to report 'Engine running', then try again.");
    say("");
    say(`  ${DIM}Check with: docker info${RESET}`);
    process.exit(1);
  }
}

/** True when the local Supabase stack is already up. */
function supabaseRunning() {
  const { code, out } = capture("supabase", ["status", "-o", "env"]);
  return code === 0 && out.includes("API_URL");
}

/**
 * Parse `supabase status -o env` into a plain object.
 * Values arrive shell-quoted, e.g. API_URL="http://127.0.0.1:54321".
 */
function supabaseEnv() {
  const { code, out } = capture("supabase", ["status", "-o", "env"]);
  if (code !== 0) {
    fail("Could not read `supabase status`. Is the stack up? Try: pnpm up");
    process.exit(1);
  }
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

/**
 * Write the local Supabase credentials into the env files the apps read.
 *
 * Only ever rewrites the keys it owns, preserving anything else already in the
 * file — a developer's own additions (a provider API key, a feature flag) must
 * survive `pnpm up`.
 */
function writeEnvFiles() {
  const env = supabaseEnv();
  const url = env.API_URL;
  const anon = env.ANON_KEY;
  const serviceRole = env.SERVICE_ROLE_KEY;
  const dbUrl = env.DB_URL;

  if (!url || !anon) {
    fail("`supabase status` did not report API_URL / ANON_KEY.");
    process.exit(1);
  }

  const owned = {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    DATABASE_URL: dbUrl,
  };

  const target = path.join(repoRoot, "apps", "web", ".env.local");
  let existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";

  // Drop the lines we own, keep everything else, then append fresh values.
  const kept = existing
    .split(/\r?\n/)
    .filter((l) => {
      const key = /^([A-Z0-9_]+)=/.exec(l.trim())?.[1];
      return !(key && key in owned);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  const header =
    "# Local Supabase credentials, written by `pnpm dev:up` (scripts/dev-env.mjs).\n" +
    "# These point at the LOCAL Docker stack, not the shared cloud project.\n" +
    "# Safe to commit? NO — this file is gitignored. Safe to edit? Yes, except\n" +
    "# the four keys below, which are rewritten on every `pnpm dev:up`.\n";

  const body = Object.entries(owned)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${kept ? kept + "\n\n" : ""}${header}${body}\n`);
  ok(`wrote ${path.relative(repoRoot, target)}`);
}

/** The Postgres container name, derived from config.toml's project_id. */
const DB_CONTAINER = "supabase_db_sparstrowgen";

/** Local Postgres, as `supabase start` exposes it. Never a cloud URL. */
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** How many tables exist in `public`. 0 means the schema has not been built. */
function localTableCount() {
  const { code, out } = capture("docker", [
    "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tAc",
    "select count(*) from information_schema.tables where table_schema='public';",
  ]);
  if (code !== 0) return -1;
  const n = parseInt(out.trim(), 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Build the control plane in the local database.
 *
 * Two steps, and the choice of the first one matters:
 *
 *  1. `drizzle-kit push` from packages/shared/src/db/schema.ts. NOT the
 *     `apply-to-supabase.sql` bundle — that bundle had drifted from the schema
 *     it claims to build (missing agent_machine_restrictions,
 *     chat_message_attachments, chat_turns, machine_shared_locations and
 *     provider_model_cache; still creating the long-dropped pairing_codes).
 *     `push` derives from the schema, so it cannot drift from it.
 *
 *  2. The RLS policy files, in numeric order. Four of them fail against the
 *     current schema because they configure objects a later migration removed;
 *     that is expected and is reported rather than hidden. The one that
 *     mattered — 001_rls.sql aborting before it reached runtime_commands, the
 *     dispatch queue — is fixed. See
 *     doc/security/SEC-2026-09-02-rls-bootstrap-aborts-leaving-dispatch-unprotected.md
 */
function applySchema() {
  step("building the schema (drizzle-kit push from schema.ts)");
  const pushCode = run(
    "npx",
    ["drizzle-kit", "push", "--config=packages/shared/drizzle.config.ts", "--force"],
    { env: { ...process.env, DATABASE_URL: LOCAL_DB_URL } },
  );
  if (pushCode !== 0) {
    fail("drizzle-kit push failed. See the output above.");
    process.exit(pushCode);
  }

  step("applying RLS policies");
  const dir = path.join(repoRoot, "packages", "shared", "drizzle", "policies");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const failures = [];
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const res = spawnSync(
      shellCommand("docker", [
        "exec", "-i", DB_CONTAINER,
        "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-",
      ]),
      { cwd: repoRoot, input: sql, encoding: "utf8", shell: true },
    );
    if ((res.status ?? 1) !== 0) {
      const line = ((res.stderr ?? "") + (res.stdout ?? ""))
        .split(/\r?\n/)
        .find((l) => /ERROR/i.test(l)) ?? "unknown error";
      failures.push({ f, line: line.trim() });
    }
  }

  // Report, never hide. These four are known and benign: each configures an
  // object a later migration dropped. A FIFTH failure appearing here is not
  // benign and should be read as a real defect.
  const KNOWN_BENIGN = new Set([
    "005_harden_legacy_functions.sql",
    "008_redeem_pairing_code.sql",
    "019_daemon_realtime_identity.sql",
    "031_pairing_attempts.sql",
  ]);
  for (const { f, line } of failures) {
    if (KNOWN_BENIGN.has(f)) warn(`${f} — expected: ${line.slice(0, 70)}`);
    else fail(`${f} — UNEXPECTED: ${line.slice(0, 70)}`);
  }
  const unexpected = failures.filter((x) => !KNOWN_BENIGN.has(x.f));
  if (unexpected.length) {
    fail(`${unexpected.length} unexpected policy failure(s) — the local database is not trustworthy.`);
    process.exit(1);
  }

  // The check that actually matters, asserted rather than assumed.
  const { out } = capture("docker", [
    "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tAc",
    "select coalesce(string_agg(tablename, ', '), '') from pg_tables where schemaname='public' and not rowsecurity;",
  ]);
  const unprotected = out.trim();
  if (unprotected) {
    fail(`tables without row-level security: ${unprotected}`);
    say("  This is the defect SEC-2026-09-02 describes. Do not develop against this.");
    process.exit(1);
  }
  ok("schema built, RLS enabled on every table");
}

function cmdUp() {
  requireDocker();

  if (supabaseRunning()) {
    ok("local Supabase is already up");
  } else {
    step("starting local Supabase (first run pulls images — this takes a while)");
    const code = run("supabase", ["start"]);
    if (code !== 0) {
      fail("`supabase start` failed. See the output above.");
      process.exit(code);
    }
    ok("local Supabase is up");
  }

  // A fresh `supabase start` gives an EMPTY database — the control plane's 42
  // tables live in packages/shared, not in supabase/migrations. Without this,
  // `pnpm dev:up` would cheerfully launch the app against nothing.
  const tables = localTableCount();
  if (tables === 0) {
    say(`${DIM}  database is empty — building the schema${RESET}`);
    applySchema();
  } else if (tables > 0) {
    ok(`database has ${tables} tables`);
  }

  writeEnvFiles();

  const env = supabaseEnv();
  say("");
  say(`  ${BOLD}Studio${RESET}    ${env.STUDIO_URL ?? "http://127.0.0.1:54323"}`);
  say(`  ${BOLD}API${RESET}       ${env.API_URL}`);
  say(`  ${BOLD}Inbucket${RESET}  ${env.INBUCKET_URL ?? "http://127.0.0.1:54324"}  ${DIM}(magic-link emails land here)${RESET}`);
  say("");
  step("starting the web dev server");
  say(`${DIM}  (server/ does not exist yet — it arrives in restructure Phase 1,${RESET}`);
  say(`${DIM}   and this command starts it alongside the app when it does)${RESET}`);
  say("");
  process.exit(run("pnpm", ["--filter", "web", "dev"]));
}

function cmdDown() {
  requireDocker();
  step("stopping local Supabase");
  process.exit(run("supabase", ["stop"]));
}

function cmdStatus() {
  const { code, out } = capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (code !== 0) {
    warn("Docker is not running — local Supabase cannot be up.");
    process.exit(0);
  }
  ok(`Docker ${out.trim()}`);
  process.exit(run("supabase", ["status"]));
}

function cmdDbReset() {
  requireDocker();
  step("resetting the local database (drops all local data)");
  say(`${DIM}  This touches the LOCAL Docker database only. The shared cloud${RESET}`);
  say(`${DIM}  project is not reachable from this command — the connection string${RESET}`);
  say(`${DIM}  is hardcoded to 127.0.0.1:54322.${RESET}`);

  // `supabase db reset` would also run migrations and seeds; there are none of
  // ours in supabase/, so drop and rebuild the schema directly. Fewer moving
  // parts, and it fails loudly rather than leaving a half-built database.
  const dropCode = run("docker", [
    "exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-q", "-c",
    "drop schema public cascade; create schema public; grant all on schema public to postgres, anon, authenticated, service_role;",
  ]);
  if (dropCode !== 0) {
    fail("could not drop the local public schema.");
    process.exit(dropCode);
  }
  applySchema();
  process.exit(0);
}

const commands = {
  up: cmdUp,
  down: cmdDown,
  status: cmdStatus,
  "db:reset": cmdDbReset,
  env: () => {
    requireDocker();
    writeEnvFiles();
  },
};

const cmd = process.argv[2];
if (!cmd || !(cmd in commands)) {
  say(`${BOLD}dev-env${RESET} — local environment for Sparstrowgen`);
  say("");
  say("  pnpm dev:up       start local Supabase, write env files, run the app");
  say("  pnpm dev:down     stop local Supabase");
  say("  pnpm dev:status   what is running");
  say("  pnpm dev:env      rewrite env files from the running stack");
  say("  pnpm db:reset     drop and re-migrate the LOCAL database");
  say("");
  say(`${DIM}  The dev: prefix is required — "up" and "env" are pnpm built-ins${RESET}`);
  say(`${DIM}  and shadow same-named scripts (pnpm up === pnpm update).${RESET}`);
  process.exit(cmd ? 1 : 0);
}
commands[cmd]();
