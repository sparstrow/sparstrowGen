// 0004 Phase 1 — stage everything the packaged app ships as extraResources.
// Run from the repo root (or via `pnpm --filter @sparstrow/desktop dist:prepare`)
// AFTER `pnpm build` has produced core/dist and the memory bundles.
//
// Layout produced (consumed by packaged-env.ts at runtime):
//   resources-staging/
//     core/            pnpm-deployed core (dist/index.js + prod node_modules,
//                      native .node prebuilds included)
//     memory-mcp/      index.cjs
//     memory-cli/      index.cjs
//     node-runtime/    plain Node matching the natives' ABI (see step 4)
//     channel.json     which backend this install talks to (stable/staging)
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(here, "..");
const repoRoot = path.join(desktopDir, "..", "..");
const staging = path.join(desktopDir, "resources-staging");

const run = (cmd, cwd = repoRoot) => {
  console.log(`[prepare] ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
};
const copy = (from, to) => {
  console.log(`[prepare] copy ${path.relative(repoRoot, from)} -> ${path.relative(desktopDir, to)}`);
  fs.cpSync(from, to, { recursive: true });
};
const mustExist = (p, hint) => {
  if (!fs.existsSync(p)) {
    console.error(`[prepare] missing: ${p}\n  ${hint}`);
    process.exit(1);
  }
};

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

// 1. Core: bundle + deploy with prod node_modules (natives ride along).
// node-linker=hoisted is LOAD-BEARING: pnpm's default node_modules is a tree of
// symlinks into .pnpm/, and electron-builder's copier can't follow them.
// Hoisted emits a flat, symlink-free real tree (verified: 0 symlinks, every
// native .node present).
run("pnpm --filter @sparstrow/server build");
run(
  `pnpm --filter @sparstrow/server deploy --prod --legacy --config.node-linker=hoisted --config.confirmModulesPurge=false "${path.join(staging, "core")}"`,
);
// The legacy deploy implementation resolves the WHOLE workspace in
// production-only mode (`--prod`) to produce its snapshot, then persists
// that as the shared `node_modules/.pnpm-workspace-state-v1.json` at the
// repo root — a `filteredInstall: true` marker with `production: true,
// dev: false`. It does this even though the deploy target
// (resources-staging/**) is excluded from the workspace in
// pnpm-workspace.yaml; the pollution isn't about workspace membership, it's
// that `deploy` always overwrites the root's tracked install state as a
// side effect. The next `pnpm --filter <pkg> run/build` command distrusts a
// cached *filtered* install (pnpm's `ignoreFilteredInstallCache` behavior)
// and, on non-interactive stdin, silently "self-heals" by re-running
// `pnpm install` with whatever dev/production flags that stale state
// recorded — i.e. `pnpm install --production`, workspace-wide, stripping
// devDependencies (esbuild et al.) repo-wide. A plain, unfiltered
// `pnpm install` right here is the fix: it's a fast no-op against an
// unchanged lockfile, and it overwrites the poisoned state with the correct
// `filteredInstall: false, dev: true, production: true` snapshot before any
// other workspace command can read the bad one.
run("pnpm install");
// The deploy snapshot includes src/tsconfig etc. — harmless but dead weight; trim.
for (const extra of ["src", "build.mjs", "tsconfig.json", "vitest.config.ts", "scripts"]) {
  fs.rmSync(path.join(staging, "core", extra), { recursive: true, force: true });
}
mustExist(path.join(staging, "core", "dist", "index.js"), "core build failed");
// The API server, supervised alongside the daemon. Checked separately and by
// name: an install that ships the daemon and no server is `G-67` all over
// again, and from the outside it looks like a working app that cannot reach
// anything.
mustExist(
  path.join(staging, "core", "dist", "server.js"),
  "server bundle missing — server/build.mjs must emit dist/server.js",
);
// electron-builder's extraResources copier UNCONDITIONALLY skips any directory
// literally named `node_modules` (a `filter` can't override it). So rename the
// deployed deps to `vendor` — that survives packaging intact — and the desktop
// shell junctions `node_modules` -> `vendor` at first launch (see
// ensureCoreNodeModules in packaged-env.ts). Confirmed: `vendor` ships whole
// (214 pkgs, native .node present); `node_modules` gets stripped to nothing.
const coreNm = path.join(staging, "core", "node_modules");
const coreVendor = path.join(staging, "core", "vendor");
mustExist(
  path.join(coreNm, "better-sqlite3", "build", "Release", "better_sqlite3.node"),
  "native prebuilds missing from staged core — deploy/linker regression",
);
fs.rmSync(coreVendor, { recursive: true, force: true });
fs.renameSync(coreNm, coreVendor);

// 2. Memory bundles (single-file cjs each).
for (const name of ["memory-mcp", "memory-cli"]) {
  const bundle = path.join(repoRoot, "packages", name, "dist", "index.cjs");
  mustExist(bundle, `run \`pnpm --filter @sparstrow/${name} build\` first`);
  fs.mkdirSync(path.join(staging, name), { recursive: true });
  fs.copyFileSync(bundle, path.join(staging, name, "index.cjs"));
}

// 3. (removed) The bundled Next.js server.
//
// The installer used to carry a full Next.js standalone build, because every
// write in the app was a Server Action — callable only from inside a Next
// render — so the only way the desktop app could have a feature was to ship the
// web server inside it and load it over loopback. The renderer is now a plain
// Vite SPA (`out/renderer`, built by `electron-vite`) talking HTTP to
// `server/`, so there is nothing to stage and nothing to spawn.
//
// The node runtime below is a SEPARATE question and is deliberately still here
// — see its own comment.

// 4. Node runtime: the Node this script runs under IS the ABI the workspace's
// native prebuilds were installed for — ship exactly that binary.
//
// The restructure plan expected this to go with the web server. It cannot yet,
// and the reason is worth stating so nobody deletes it again hoping: the daemon
// still imports four native modules — `better-sqlite3` (its own store) plus
// `node-pty`, `fastembed` and `sqlite-vec` from the three PARKED subsystems
// (terminals, memory/RAG). Native addons are compiled for a specific Node ABI,
// and Electron's differs, so the daemon must run on plain Node and a packaged
// install has to carry one.
//
// The path to removing it is not a packaging change: it is unwiring the parked
// subsystems (`D-31`, `D-37`), after which `better-sqlite3` is the last native
// module and Node 22's built-in `node:sqlite` can replace it. Tracked as `G-64`.
const nodeDir = path.join(staging, "node-runtime");
fs.mkdirSync(nodeDir, { recursive: true });
const nodeName = process.platform === "win32" ? "node.exe" : "node";
fs.copyFileSync(process.execPath, path.join(nodeDir, nodeName));
console.log(`[prepare] node runtime: ${process.version} (${process.execPath})`);

// 5. Channel config: which backend THIS specific build talks to, baked in so
// a packaged install works out of the box — see src/channel.ts for why this
// is a per-install resource file rather than a machine-wide env var (stable
// and staging now install side by side; a shared env var would let one
// silently repoint the other).
const CHANNELS = {
  stable: {
    channel: "stable",
    updateChannel: "latest",
    appUrl: "https://sparstrow.com",
    cloudUrl: "https://sparstrow.com",
  },
  staging: {
    channel: "staging",
    updateChannel: "staging",
    appUrl: "https://staging.sparstrow.com",
    cloudUrl: "https://staging.sparstrow.com",
  },
};
// CLI arg takes precedence (dist:stable/dist:staging pass it explicitly, so
// this never depends on shell env-var syntax, which differs between the bash
// and cmd.exe/PowerShell steps this repo's workflows and machines mix); the
// env var is kept as a fallback for a manual local run.
const buildChannel = process.argv[2] || process.env.SPARSTROW_BUILD_CHANNEL || "stable";
if (!CHANNELS[buildChannel]) {
  console.error(
    `[prepare] unknown SPARSTROW_BUILD_CHANNEL="${buildChannel}" — expected one of: ${Object.keys(CHANNELS).join(", ")}`,
  );
  process.exit(1);
}
fs.writeFileSync(path.join(staging, "channel.json"), JSON.stringify(CHANNELS[buildChannel], null, 2));
console.log(`[prepare] channel: ${buildChannel} (${CHANNELS[buildChannel].appUrl})`);

console.log(`[prepare] staged at ${staging}`);
