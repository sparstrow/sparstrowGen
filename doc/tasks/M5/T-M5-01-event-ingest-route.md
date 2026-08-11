# T-M5-01 — Event ingest route + batch contract

| | |
|---|---|
| **Tag** | `[S]` sequential — defines the contract 03 and 05 are written against |
| **Depends on** | — |
| **Blocks** | T-M5-02, T-M5-03, T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

`POST /api/daemon/runs/:id/events` — the durable half of the dual path. A daemon
hands over a batch of transcript events; they land in cloud `run_events` exactly
once, scoped to the workspace the token belongs to.

The broadcast fan-out is [T-M5-02](T-M5-02-broadcast-and-rls.md) and plugs into
this route. Build the durable write first and prove it alone: if transcripts
arrive but do not stream, that is a latency bug; if they stream but do not
persist, the phase has no value at all.

## Decisions already made

**The contract lives in `packages/shared/src/cloud.ts`**, beside M4's, because
both ends compile against it:

```ts
export const TRANSCRIPT_BATCH_MAX_EVENTS = 25;
export const TRANSCRIPT_BATCH_INTERVAL_MS = 1_000;
export const TRANSCRIPT_BATCH_MAX_BYTES = 128 * 1024;

export interface RunEventPush {
  seq: number;
  ts: string;          // ISO
  type: RunEventType;
  payload: unknown;
}

export interface RunEventBatch {
  events: RunEventPush[];
}

export interface RunEventBatchResponse {
  /** Highest seq now durable in the cloud for this run. */
  storedThroughSeq: number;
  /** Rows the upsert skipped because they were already there. A replay reads 0 stored. */
  stored: number;
  duplicates: number;
}
```

`storedThroughSeq` is what the daemon advances its cursor to, and it comes from
the server rather than from the daemon's own optimism — a batch that half-landed
before a timeout must not move the cursor past the missing half.

**Ownership is verified before the write, not assumed from the path.** Read the
run row filtered by both `id` and `workspace_id` from the scope. A run belonging
to another workspace, or no run at all, returns the **same** 404. Two different
answers is a probe that maps other workspaces' run ids.

This is M4's status-route defect, which shipped and was caught only by running
it live: it reported `{ok: true}` while writing nothing for a foreign run.
Do not rediscover it.

**The upsert ignores duplicates**, per phase decision 5:

```ts
.upsert(rows, { onConflict: "run_id,seq", ignoreDuplicates: true })
```

**Reject a batch that is not internally sane** with 400 and a reason token,
before touching the database: empty `events`, `seq` values that are negative or
non-integer, duplicate `seq` within the batch, more than
`TRANSCRIPT_BATCH_MAX_EVENTS * 2` events, or a body over ~1 MB. A malformed
batch is a daemon bug, and a 400 makes it visible; silently storing the sane
subset makes it permanent.

**A terminal run still accepts events.** The final batch commonly arrives after
the status report that ended the run — that ordering is normal, not an error, and
refusing it would truncate every transcript at its most useful point. Only a run
that does not exist is refused.

## Checklist

- [ ] Contract types and the three `TRANSCRIPT_*` constants in `packages/shared/src/cloud.ts`
- [ ] `apps/web/src/app/api/daemon/runs/[id]/events/route.ts`
- [ ] `authenticateDaemon()` first; 401 `unauthenticated`, 403 `revoked`, mirroring the existing daemon routes exactly
- [ ] Ownership lookup on `(id, workspace_id)` before any write; foreign **and** unknown → identical 404
- [ ] Batch sanity validation → 400 with a reason token, before the database
- [ ] Upsert with `onConflict: "run_id,seq"`, `ignoreDuplicates: true`, `workspace_id` from the scope on every row
- [ ] Response carries `storedThroughSeq`, `stored`, `duplicates`
- [ ] `run_id` is taken from the path **and** re-checked against the row; `workspace_id` is never read from the body
- [ ] Fix `runEventSchema.id` — see Traps
- [ ] Route tests in `apps/web/src/lib/api/`: happy path, replay is idempotent, foreign workspace 404s, unknown run 404s, malformed batch 400s, terminal run accepts

## Traps

**`runEventSchema` declares an `id` the cloud does not have.**
`packages/shared/src/schemas/run.ts:47` requires `id: z.number().int()`; cloud
`run_events` is keyed on `(run_id, seq)` with no `id` column, and
`GET /runs/:id/events` already returns rows without one. Make it
`id: z.number().int().optional()` and check every consumer — `run-transcript.tsx`
keys on `seq`, which is why nothing has crashed, but the type is currently a
false statement about data that already flows.

**`payload` is jsonb and the router case-converts.** M2's `toSnake`/`toCamel`
are jsonb-aware and must leave `payload` **unmutated** — a provider line whose
keys get snake_cased is a corrupted transcript that still renders. M2 verified
this property; assert it here for this route specifically, because this is the
first daemon route to carry an opaque blob.

**`ts` is `timestamp with time zone` in the cloud and a `text` ISO string
locally.** Pass the ISO string through; do not `new Date()` it in the route and
re-serialise, which is how a machine in a non-UTC timezone shifts an entire
transcript by its offset.

**Do not log the batch.** Payloads are prompts, file contents, and tool output.
The error path is the tempting one — a failed upsert logged with the rows
attached puts a user's source code in a platform log.

## Verification

- [ ] Route tests green
- [ ] `pnpm -r typecheck` clean after the `runEventSchema` change
- [ ] Live ingest, cross-workspace refusal, and replay idempotency → **T-M5-06**

## On completion

- [ ] Tick 7.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
