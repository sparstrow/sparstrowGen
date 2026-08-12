# T-M6-01 — Sync contract + daemon routes

| | |
|---|---|
| **Tag** | `[S]` sequential — defines the contract 03 and 04 are written against |
| **Depends on** | — |
| **Blocks** | T-M6-03, T-M6-04, T-M6-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

`POST /api/daemon/memory/push` and `GET /api/daemon/memory/pull` — the two
routes every other task builds against. Push resolves last-write-wins per
note and tells the caller who won; pull is a cursor-paginated incremental
scan.

## Decisions already made

**Push is a batch**, matching phase decision 5's debounce: a burst of edits
coalesced into one push should be one request, not N.

```ts
export interface MemoryNoteSyncPayload {
  id: string;
  path: string;
  scope: "global" | "project" | "agent";
  projectSlug: string | null;
  agentSlug: string | null;
  title: string;
  tags: string[];
  source: string;
  type: string;
  content: string;
  quarantined: boolean;
  archivedAt: string | null;
  supersededBy: string | null;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryPushRequest {
  notes: MemoryNoteSyncPayload[];
}

export interface MemoryPushResult {
  id: string;
  applied: boolean;
  /** Present when `applied` is false: the cloud's current, newer row — so the
   *  daemon can reconcile locally without waiting for the next pull. */
  current?: MemoryNoteSyncPayload;
}

export interface MemoryPushResponse {
  results: MemoryPushResult[];
}

export interface MemoryPullResponse {
  notes: MemoryNoteSyncPayload[];
  nextCursor: { updatedAt: string; id: string } | null;
}

export const MEMORY_SYNC_DEBOUNCE_MS = 2_000;
export const MEMORY_SYNC_SWEEP_MS = 5 * 60_000;
export const MEMORY_PULL_PAGE_SIZE = 200;
```

**Per-note LWW, applied in one transaction per batch, decided per row —
phase decision 2.** For each incoming note:

- Look up the cloud row by `(workspace_id, id)`.
- No row: insert. `applied: true`.
- Row exists, `contentHash` equal: no-op. `applied: true` (nothing changed,
  but the daemon's version IS what the cloud has — not a rejection).
- Row exists, hashes differ, incoming `updatedAt` > cloud `updatedAt`:
  update. `applied: true`.
- Row exists, hashes differ, incoming `updatedAt` <= cloud `updatedAt`: no
  write. `applied: false`, `current` = the cloud row as a
  `MemoryNoteSyncPayload`.

**`lastWriterRuntimeId` is stamped from the token, never the body** — same
containment rule as every other daemon route, applied to a field that is not
itself scope-security-critical but should not be a place a client can lie
regardless.

**Pull orders by `(updated_at, id)` ascending** — phase decision 7's tuple
cursor, not `updatedAt` alone, because two notes can share a
millisecond-resolution timestamp. Query shape:

```sql
where workspace_id = :workspaceId
  and (updated_at, id) > (:cursorUpdatedAt, :cursorId)
order by updated_at, id
limit :limit
```

`cursorUpdatedAt`/`cursorId` default to the epoch and empty string when the
caller has no prior cursor (first pull ever). `nextCursor` in the response is
the last row's `(updatedAt, id)`, or `null` when the page came back short
(fewer than `MEMORY_PULL_PAGE_SIZE`) — mirrors `T-M5-01`'s
`storedThroughSeq` pattern: the server's own number, not the caller's guess.

## Checklist

- [ ] Types and constants in `packages/shared/src/cloud.ts`
- [ ] `apps/web/src/app/api/daemon/memory/push/route.ts`
- [ ] `apps/web/src/app/api/daemon/memory/pull/route.ts`
- [ ] `authenticateDaemon()` first on both; 401/403 mirroring every other daemon route
- [ ] Push: per-note LWW exactly as decided above, one transaction per batch
- [ ] Push: `workspace_id` and `last_writer_runtime_id` from the token scope on every write, never the body
- [ ] Push: after a batch applies at least one write, enqueue a `memory.sync` command for every OTHER online runtime in the workspace (phase decision 6) — reuse `isRuntimeOnline`, not `runtimes.status`
- [ ] Pull: `(updated_at, id)` tuple comparison, `MEMORY_PULL_PAGE_SIZE` cap, honest `nextCursor`
- [ ] Route tests: push creates, push no-ops on identical hash, push rejects a stale write and returns `current`, pull pages correctly, pull cursor excludes already-seen rows, cross-workspace push/pull both refused

## Traps

**The `memory.sync` command payload needs nothing** — the pulling daemon
already knows its own workspace from ITS token; the command is a wake-up, not
a delivery. An empty or minimal payload (`{}`) is correct; do not try to
smuggle the pushed note's content into the command itself, which would be a
second, uncoordinated copy of the data pull already fetches authoritatively.

**Only enqueue `memory.sync` for runtimes that are actually online.** An
offline machine's command sits until it expires (M4's attempts ceiling) —
harmless, but pointless, and the periodic pull sweep is what actually
guarantees delivery to a machine that was offline when the push happened.

**A batch that partially applies is not a batch failure.** Some notes in a
push can win and others lose LWW in the same request — this is normal, not
an error. The route always returns 200 with per-note results; there is no
"the whole batch failed" case except auth/malformed-body.

**Do not let a push silently create a row for a workspace the token cannot
prove.** `workspace_id` is scope-derived on every insert, same as everywhere
else in `/api/daemon/*` — this route holds the service role and RLS will not
save a mistake here.

## Verification

- [ ] Route tests green
- [ ] `pnpm -r typecheck` clean
- [ ] Live push/pull round-trip and cross-workspace refusal → **T-M6-05**

## On completion

- [ ] Tick 8.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
