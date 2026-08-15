import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * `apps/web` had no vitest config, so `pnpm test` ran on vitest's defaults and
 * resolved nothing from `tsconfig.json`. That worked only because every test so
 * far exercised a module whose own imports were relative or into
 * `@sparstrow/shared`; the first module under test importing `@web/*` — which
 * is how the rest of this app is written — failed at collection.
 *
 * The alias mirrors `tsconfig.json`'s `paths`. Keep the two in step: a module
 * that typechecks and then cannot be imported by a test is a silent
 * disincentive to writing the test.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@web": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
