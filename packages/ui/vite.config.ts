import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

// Mirror the core's per-install token (exclusive-create avoids a write race),
// so the dev proxy can attach it to forwarded /api and /ws requests. The
// browser never sees it in dev.
function devToken(): string {
  if (process.env.SPARSTROW_TOKEN) return process.env.SPARSTROW_TOKEN;
  const dataDir = process.env.SPARSTROW_DATA_DIR ?? path.resolve(here, "..", "..", "data");
  const tokenPath = path.join(dataDir, ".api-token");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const fd = fs.openSync(tokenPath, "wx", 0o600);
    const t = crypto.randomBytes(32).toString("hex");
    fs.writeSync(fd, t);
    fs.closeSync(fd);
    return t;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      return fs.readFileSync(tokenPath, "utf8").trim();
    }
    return "";
  }
}

const authHeader: Record<string, string> = {};
const resolvedToken = devToken();
if (resolvedToken) authHeader.Authorization = `Bearer ${resolvedToken}`;

// The dev proxy points at wherever the dev core is actually listening. Defaults
// to the core's default 127.0.0.1:48750; set SPARSTROW_PORT (and SPARSTROW_HOST)
// to follow a dev core on a non-default port — e.g. 48751 while an always-on
// packaged app holds 48750 (intake 0005). Same env vars core's config.ts reads,
// so the two never disagree.
const coreHost = process.env.SPARSTROW_HOST || "127.0.0.1";
const corePort = Number(process.env.SPARSTROW_PORT) || 48750;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
    },
  },
  server: {
    // Honor PORT when set (e.g. the preview harness assigns one); default 5173.
    port: Number(process.env.PORT) || 5173,
    proxy: {
      "/api": {
        target: `http://${coreHost}:${corePort}`,
        changeOrigin: true,
        headers: authHeader,
      },
      "/ws": {
        target: `ws://${coreHost}:${corePort}`,
        ws: true,
        headers: authHeader,
      },
    },
  },
});
