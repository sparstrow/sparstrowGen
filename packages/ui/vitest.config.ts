import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// All that survives of the old vite.config.ts (T-VR-01). That file existed to
// run the Vite app — dev server, core proxy, react and tailwind plugins — and
// carried the `@` alias as one line among them. The app is gone; the alias is
// not, because every test in this package imports through it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(here, "src"),
    },
  },
});
