import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Several suites spawn real child processes or touch the real filesystem
    // (graph client pool, viz-manager, git-status, host-fs). The default
    // 5000ms/10000ms budgets are fine in isolation but get blown under
    // `turbo run test`'s five-way concurrent workspace run, where those
    // operations compete for the same CPU/disk — see
    // doc/bug/BUG-2026-08-22-core-tests-flake-under-turbo-parallelism.md.
    // That's contention, not a hang; src/api/routes/host-fs.test.ts already
    // opted itself into 30s for the same reason.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
