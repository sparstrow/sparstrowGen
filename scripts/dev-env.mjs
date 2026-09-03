#!/usr/bin/env node
/**
 * dev-env — one command to get a working local environment.
 *
 * Usage:  pnpm up | pnpm down | pnpm status | pnpm db:reset | pnpm env
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

/** Run a command, inheriting stdio. Returns the exit code. */
function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return res.status ?? 1;
}

/** Run a command and capture stdout. Returns { code, out }. */
function capture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
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
    "# Local Supabase credentials, written by `pnpm up` (scripts/dev-env.mjs).\n" +
    "# Safe to commit? NO — this file is gitignored. Safe to edit? Yes, except\n" +
    "# the four keys below, which are rewritten on every `pnpm up`.\n";

  const body = Object.entries(owned)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${kept ? kept + "\n\n" : ""}${header}${body}\n`);
  ok(`wrote ${path.relative(repoRoot, target)}`);
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
  step("resetting the local database (drops all local data, re-applies migrations)");
  say(`${DIM}  This touches the LOCAL Docker database only. The shared cloud${RESET}`);
  say(`${DIM}  project is never reachable from this command.${RESET}`);
  process.exit(run("supabase", ["db", "reset"]));
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
  say("  pnpm up         start local Supabase, write env files, run the app");
  say("  pnpm down       stop local Supabase");
  say("  pnpm status     what is running");
  say("  pnpm db:reset   drop and re-migrate the LOCAL database");
  say("  pnpm env        rewrite env files from the running stack");
  process.exit(cmd ? 1 : 0);
}
commands[cmd]();
