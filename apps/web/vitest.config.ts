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
 *
 * `@` was missing from this list (band 27, `T-AM4-01`) — `tsconfig.json` maps
 * it to `packages/ui/src`, the shadcn primitives every `.tsx` component in
 * this app imports (`@/components/ui/*`, `@/lib/utils`). Its absence is why
 * `T-AM3-01` could not unit-test `groupProducedAttachments`: importing
 * `conversation-items.tsx` at all — even just for its plain, non-JSX exports
 * — pulled in `Button`/`Empty`/`Skeleton` and failed at collection before a
 * single assertion ran. Confirmed this exact repro before adding the alias.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@web": fileURLToPath(new URL("./src", import.meta.url)),
      "@": fileURLToPath(new URL("../../packages/ui/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
