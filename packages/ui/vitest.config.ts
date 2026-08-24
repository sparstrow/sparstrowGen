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
  test: {
    // T-VR-07 moved every test file this package had (all six) to apps/web
    // along with the app code they tested. What remains here is presentational
    // design-system primitives with no tests of their own — a legitimate state
    // for this package, not a gap — and vitest's default of failing when zero
    // test files exist would otherwise turn "no tests to write yet" into a
    // permanently red `pnpm test`.
    passWithNoTests: true,
  },
});
