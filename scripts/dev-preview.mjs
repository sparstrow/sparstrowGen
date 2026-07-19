// Dev/preview launcher (intake 0005). Runs a core or ui dev process on a
// NON-default port with a throwaway data dir, so a dev/preview stack never
// collides with an always-on packaged app holding 48750. ONLY dev tooling uses
// this (.claude/launch.json, `pnpm dev:preview:*`); the packaged desktop app
// spawns core directly and never sets these vars, so it stays on 48750.
//
// `??=` so an explicit override still wins (e.g. running two preview stacks).
// Both core and ui get the same SPARSTROW_PORT/SPARSTROW_DATA_DIR: ui only
// reads them so its vite proxy targets the right core and finds the matching
// per-install token in the same data dir.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (target !== "core" && target !== "ui") {
  console.error(`usage: node scripts/dev-preview.mjs <core|ui>  (got: ${target ?? "nothing"})`);
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.SPARSTROW_PORT ??= "48751";
process.env.SPARSTROW_DATA_DIR ??= path.join(repoRoot, "data-preview");

const filter = target === "ui" ? "@sparstrow/ui" : "@sparstrow/core";
const script = target === "ui" ? "dev" : "start";

// shell:true is required on Windows (Node 24 refuses to spawn pnpm.cmd directly:
// EINVAL). The DEP0190 arg-escaping caveat doesn't apply here — `filter`/`script`
// are a fixed two-value allowlist derived from the validated `target`, never user
// input, so there's nothing to inject.
const child = spawn("pnpm", ["--filter", filter, script], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
