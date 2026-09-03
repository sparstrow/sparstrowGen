/**
 * `daemon` — the per-machine agent runtime.
 *
 * The process that actually runs agents on someone's computer: it registers
 * with `server/`, heartbeats, takes commands, spawns provider processes, and
 * reports run events back. It keeps its own SQLite store for execution state.
 *
 * Behaviour is unchanged from when this was `packages/core`'s entry point —
 * this file exists so the two things that tree can start are named, and named
 * next to each other. `cmd/server.ts` is the other.
 *
 *   pnpm --filter @sparstrow/server dev
 *   pnpm --filter @sparstrow/server start
 */
import "../src/index";
