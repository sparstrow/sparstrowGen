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

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  external,
  logLevel: "info",
});
