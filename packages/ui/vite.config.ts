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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:48750",
        changeOrigin: true,
        headers: authHeader,
      },
      "/ws": {
        target: "ws://127.0.0.1:48750",
        ws: true,
        headers: authHeader,
      },
    },
  },
});
