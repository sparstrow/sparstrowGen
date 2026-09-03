// 0004 Phase 1 — bundle core to runnable JS for the packaged desktop app.
// Workspace code (@sparstrow/shared, TS-only exports) is bundled IN; every npm
// dependency stays external and is provided at runtime by the `pnpm deploy`
// node_modules staged next to dist/ (native modules — better-sqlite3, node-pty,
// sqlite-vec, fastembed/onnxruntime — can never be bundled, and externalizing
// the rest keeps pino's worker-thread files and drizzle intact).
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith("@sparstrow/"));

// TWO entry points, one bundle directory, one set of node_modules beside it.
//
// `dist/index.js` is the daemon (the per-machine agent runtime) and
// `dist/server.js` is the API every client talks to. They are separate
// processes with separate jobs, and the desktop app supervises both — see
// `G-67` for what shipping only the first one cost: an installed app whose
// renderer pointed at a port nothing listened on.
await build({
  entryPoints: ["src/index.ts", "cmd/server.ts"],
  outdir: "dist",
  entryNames: "[name]",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  external,
  logLevel: "info",
});

// esbuild names the outputs after their entry files: `index.js` and
// `server.js`. Asserted rather than assumed, because a silent rename here
// produces a packaged app that starts a daemon and no server — which is
// exactly the failure this second entry point exists to end, and it would look
// identical from the outside.
import { existsSync } from "node:fs";
for (const expected of ["dist/index.js", "dist/server.js"]) {
  if (!existsSync(new URL(`./${expected}`, import.meta.url))) {
    throw new Error(`build produced no ${expected} — entry naming changed`);
  }
}
