import { defineConfig } from "vitest/config";

// Scoped to src deliberately. This package also holds release/ and
// resources-staging/, which contain the unpacked app and a full Node runtime —
// letting the default globs walk those makes collection hang.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "release/**", "resources-staging/**", "node_modules/**"],
  },
});
