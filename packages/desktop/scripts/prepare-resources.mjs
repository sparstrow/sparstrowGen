// 0004 Phase 1 — stage everything the packaged app ships as extraResources.
// Run from the repo root (or via `pnpm --filter @sparstrow/desktop dist:prepare`)
// AFTER `pnpm build` has produced core/dist, ui/dist and the memory bundles.
//
// Layout produced (consumed by packaged-env.ts at runtime):
//   resources-staging/
//     core/            pnpm-deployed core (dist/index.js + prod node_modules,
//                      native .node prebuilds included)
//     ui/              built UI (served by core via SPARSTROW_UI_DIST)
//     memory-mcp/      index.cjs
//     memory-cli/      index.cjs
//     node-runtime/    plain Node binary matching the natives' ABI (never
//                      Electron-as-Node)
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
run("pnpm --filter @sparstrow/core build");
run(`pnpm --filter @sparstrow/core deploy --prod --legacy "${path.join(staging, "core")}"`);
// The deploy snapshot includes src/tsconfig etc. — harmless but dead weight; trim.
for (const extra of ["src", "build.mjs", "tsconfig.json", "vitest.config.ts", "scripts"]) {
  fs.rmSync(path.join(staging, "core", extra), { recursive: true, force: true });
}
mustExist(path.join(staging, "core", "dist", "index.js"), "core build failed");

// 2. UI.
const uiDist = path.join(repoRoot, "packages", "ui", "dist");
mustExist(uiDist, "run `pnpm --filter @sparstrow/ui build` first");
copy(uiDist, path.join(staging, "ui"));

// 3. Memory bundles (single-file cjs each).
for (const name of ["memory-mcp", "memory-cli"]) {
  const bundle = path.join(repoRoot, "packages", name, "dist", "index.cjs");
  mustExist(bundle, `run \`pnpm --filter @sparstrow/${name} build\` first`);
  fs.mkdirSync(path.join(staging, name), { recursive: true });
  fs.copyFileSync(bundle, path.join(staging, name, "index.cjs"));
}

// 4. Node runtime: the Node this script runs under IS the ABI the workspace's
// native prebuilds were installed for — ship exactly that binary.
const nodeDir = path.join(staging, "node-runtime");
fs.mkdirSync(nodeDir, { recursive: true });
const nodeName = process.platform === "win32" ? "node.exe" : "node";
fs.copyFileSync(process.execPath, path.join(nodeDir, nodeName));
console.log(`[prepare] node runtime: ${process.version} (${process.execPath})`);

console.log(`[prepare] staged at ${staging}`);
