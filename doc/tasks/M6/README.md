# M6 — Memory sync

| | |
|---|---|
| **Plan** | `doc/plans/2026-08-09-daemon-cloud-control-plane.md` (M6) |
| **Depends on** | M4 (complete). Not M5 — the two are `[P]` against each other |
| **Blocks** | nothing. M7 is `[P]` against this phase |
| **Status** | decomposed 2026-08-12 — not started |
| **Open questions** | none — everything below is decided |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on |
|---|---|---|
| [T-M6-01 — sync contract + daemon routes](T-M6-01-sync-contract.md) | `[S]` | — |
| [T-M6-02 — local schema: sync state + pull cursor](T-M6-02-local-schema.md) | `[P]` | — |
| [T-M6-03 — push: hook + reconciliation sweep](T-M6-03-push.md) | `[P]` | 01, 02 |
| [T-M6-04 — pull: command-triggered + full sweep](T-M6-04-pull.md) | `[C]` | 01, 02 |
| [T-M6-05 — verification](T-M6-05-verification.md) | `[S]` | 01–04 |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

A memory note written on one paired machine appears — as ordinary markdown, in
the vault, indexed through the existing local pipeline — on every other machine
paired to the same workspace. Not a shared database: each machine keeps reading
its own local, offline-tolerant index exactly as it does today. Postgres is the
hub notes pass through, not the thing anything queries at retrieval time.

**This phase is smaller than it looks**, and the reason is worth stating before
anything else: the cloud `memory_notes` table already exists.
`packages/shared/src/db/schema.ts` scaffolded it in M1 — full column set,
`uq_memory_notes_workspace_path`, an index shaped exactly for an incremental
pull (`idx_memory_notes_sync (workspaceId, updatedAt)`), and a doc comment that
already states the no-vector-column, last-write-wins, vault-is-truth design
this phase's own decisions restate. `runtimeCommands.kind`'s comment already
lists `memory.sync` as an anticipated command kind. None of it is wired to
anything. M6 is the wiring, over decisions M1 already made — not a new design
from scratch.

## Definition of done

- Saving a note on machine A causes it to appear as a `.md` file in machine B's
  vault, with the SAME `id` and the SAME vault-relative `path` — not a
  duplicate under a new filename
- `memory_search` on B returns it, through the exact same scope/quarantine/
  sandbox gates a locally-authored note goes through — no special-casing
- B computed its own embedding. No vector crosses the wire, ever — confirmed by
  the cloud schema having no vector column at all, not by a runtime check
- A note edited on both A and B while one was offline resolves without an
  error and without a duplicate — last-write-wins, stated as a real,
  accepted-risk decision, not silently hoped for
- Propagation does not require both machines online at the same instant. A
  pull picks up whatever it missed, on its own, without needing to be told
  what it missed
- `pnpm -r typecheck` and `pnpm -r test` stay green

**Two things this phase deliberately does not build**, named here so a later
reader does not go looking for them:

- **Delete does not propagate.** `deleteNote()` hard-deletes locally with no
  tombstone, and the cloud schema has no `deletedAt`. A note deleted on A
  stays alive forever on B. Parked as [D-11](../../Deferred.md) — building it
  needs a schema change this phase does not make, and the plan's own scope
  ("push local note content on write... pull foreign notes") does not ask for
  it.
- **Contradictions do not sync**, even though `memoryContradictions` has a
  full cloud mirror already sitting unused in the same schema M1 scaffolded.
  They are dream-cycle diagnostic output about ONE machine's local corpus, not
  shared content — parked alongside D-11 rather than pulled in because the
  table happened to already exist.

---

## Decisions already made

These were resolved while scoping. Do not re-open them.

### 1. Identity travels verbatim. The pull path does not call `writeNote()`

`writeNote()` mints a fresh `id` (`mem_${nanoid(10)}`) and a fresh filename
(`${slugify(title)}-${nanoid(6)}.md`) on every call — correct for a brand-new
local note, wrong for a pulled one. Calling it naively for a foreign note
would give the SAME cloud note a different id and a different path on every
machine that pulls it, which breaks the cloud's own
`uq_memory_notes_workspace_path` the moment that machine's copy is ever pushed
back (a `path` collision against a `path` the cloud already has under a
different id), and produces a visible duplicate file locally on every re-pull
that is not perfectly idempotent.

So: **`id` and `path` are the same value on every machine that has the note.**
The first machine to create a note keeps its minted id/path — that value
becomes the note's identity everywhere. A pulled note is written to that exact
vault-relative path (not re-slugified, not re-randomized), with that exact id
carried into the local `memory_notes` row. The pull path is a dedicated
writer, not `writeNote()` — closer in shape to `scanVault()`'s insert/update
logic, which already reconciles the filesystem against `memory_notes` by path.

### 2. Conflict resolution: hash first, clock second, and the clock-skew risk is accepted, not solved

`contentHash` equality is checked **before** any timestamp comparison. Two
machines that end up with identical content — the common case, since M1's own
comment observes notes are "append-mostly, one topic each" — resolve as a
no-op regardless of what either machine's clock says. This is the cheap,
skew-proof path, and it is why it runs first.

Only when hashes differ does `updatedAt` decide, and this is where the
accepted risk lives: `updatedAt` is wall-clock time from two different
machines, and nothing in this phase synchronizes those clocks. A machine with
a fast or slow clock can systematically win or lose conflicts it should not.
The plan's own instruction is explicit — **"do not build a CRDT"** — and a
clock-skew-proof merge is most of the way to one. The mitigation is the same
one the plan already leans on: conflicts are rare, because edits to an
existing note are rare (`writeNoteRaw()`'s raw editor and the dream cycle's
archive-on-merge are the only in-place mutation paths; almost everything else
is note **creation**, which cannot conflict by definition — different ids).

### 3. Chunks, FTS, and the vector index are never synced — they were never going to be

Confirmed against the existing indexer rather than assumed: `indexNote()`
unconditionally deletes and rebuilds `memory_chunks`/`memory_fts`/`memory_vec`
for a note on every index pass, from the vault file's current content. A
pulled note needs nothing pulled for these three tables — write the markdown,
call `indexer.enqueue([noteId])`, and the existing pipeline does the rest,
embedding with whatever local model this machine has. This is not a new
property this phase builds; it is the reason the cloud schema was allowed to
skip a vector column at all the first time it was written.

### 4. Push may create the cloud row. This is NOT the `project.clone` precedent, and the difference matters

`bindings.ts`'s containment argument — a daemon may describe itself, but must
never invent board identity — governs `project.clone` and every binding
report: an unmatched slug is skipped, never turned into a new cloud project.
Memory notes are the opposite case on purpose. A note is content a machine
legitimately originates, not a reference to a shared board object with its
own lifecycle; the FIRST push of a new local note is expected to create the
cloud row, scoped to the pushing daemon's own workspace from the bearer
token — never from the body, same containment rule as every other
`/api/daemon/*` route, just applied to a different kind of write.

### 5. Push: event-driven for speed, swept for correctness

Every current call site that mutates a note funnels through exactly two
functions — `writeNote()` and `writeNoteRaw()` (confirmed exhaustively: the
UI's create/raw-edit routes, the `memory_save` MCP tool, dream-cycle signal
extraction and synthesis-merge, and instance/variant template-note copying
all go through one of the two). One hook, after either, catches every
trigger — no per-caller instrumentation needed.

That hook enqueues the note id into an in-memory, debounced queue
(`MEMORY_SYNC_DEBOUNCE_MS`, 2s — long enough to coalesce a burst of rapid
edits to the same note into one push, short enough that "after the existing
`vault.ts` file write" in the plan text still reads as true). This is the fast
path, and — per every other loop in this codebase — it is **not** the
correctness guarantee. A crash between the local write and the debounced push
firing would lose that push silently if nothing else caught it.

What catches it: two new columns on local `memory_notes` —
`syncedHash`, `syncedAt` — set only once a push for that exact `contentHash`
is confirmed applied. A periodic reconciliation sweep
(`MEMORY_SYNC_SWEEP_MS`, 5 min) finds every note where `contentHash !=
syncedHash` (including `syncedHash IS NULL`, covering every note that
predates this phase) and pushes it. This is `T-M5-04`'s cursor-and-sweep
shape, applied per-note instead of per-run — proven once already, reused
rather than re-invented.

### 6. Pull: command-triggered for speed, swept for correctness — the same split, the other direction

`runtimeCommands.kind`'s comment already anticipated a `memory.sync` kind.
This phase gives it a body: when a push lands, the route enqueues a
`memory.sync` command for every OTHER online runtime in the pusher's
workspace. The command loop — already polling every `COMMAND_POLL_INTERVAL_MS`
(3s) since M4 — dispatches it exactly like `run.start`, and the daemon
responds by pulling. No new transport, no Realtime, no doorbell: the existing
mandatory poll IS the doorbell here, at a cadence already proven in
production.

The guarantee still cannot depend on that alone — a machine that was offline
when the command was enqueued never claims it (M4's `attempts` ceiling
expires unclaimed commands; it does not queue forever for an offline
target). So pull ALSO runs a full incremental sweep
(`GET /api/daemon/memory/pull?since=<cursor>`) on the same three triggers
`T-M5-04` established for backfill: startup, the failing→reachable
transition, and a periodic tick (`MEMORY_SYNC_SWEEP_MS`, the same 5-minute
constant push's sweep uses — one number, one place, both loops read it).

### 7. The pull cursor is `(updatedAt, id)`, stored in the existing `settings` table — not a new table

`idx_memory_notes_sync (workspaceId, updatedAt)` was built for exactly this
query shape: `where (updated_at, id) > (:cursorUpdatedAt, :cursorId) order by
updated_at, id`. The tuple, not `updatedAt` alone, because two notes can share
a millisecond-resolution timestamp and a bare `updatedAt` cursor would risk
skipping one of them.

The cursor is two scalars, one per daemon (not one per note, unlike push's
sync columns) — `T-M5-04`'s dedicated `cloud_event_cursors` table exists
because that cursor is per-run and per-run is unbounded. This one is a
constant-size pair. It lives as two keys in the `settings` table core already
has (`memory.pulledThroughUpdatedAt`, `memory.pulledThroughId`), the same
table the WIP snapshot toggle uses — a new single-row table for two scalars
would be a table built to hold what a key already holds.

### 8. Quarantine is the only provenance that needs to travel, and it already does

The EH7 untrusted-write clamp (`scopes.ts`) is a runtime-context check applied
BEFORE `writeNote()` is ever called — it is not persisted as a note property
beyond the `quarantined` boolean, which is an ordinary column present on both
schemas already. A note quarantined on A pulls onto B still quarantined, and
B's own read-time gates (`noteRowExcluded()`, shared by every read path
including `memory_search`) apply to it exactly as they would to a locally
quarantined note. No new clamp, no new column — the existing one already
carries the fact that matters.

### 9. Nothing about this touches `/api/v1` or browser-facing RLS

Cloud `memory_notes` is a daemon-to-daemon sync hub, not something the hosted
web UI ever queries directly — per the plan, "each daemon reads its own local
index," and memory search/notes remain the host-local, runtime-dependent
endpoints M2 already answers with an honest 501 in the hosted app. M1's RLS
already covers the table defensively (applied blanket-wide to all 36 tables),
but nothing new needs writing there: every read and write in this phase goes
through `/api/daemon/*` with the service role, exactly like M3–M5.

---

## The shape of the daemon API

Two new routes under `apps/web/src/app/api/daemon/memory/`, bearer-authenticated
like every other daemon route, workspace scope always from the token.

| Route | Purpose |
|---|---|
| `POST /api/daemon/memory/push` | Upsert a batch of notes; last-write-wins per note; returns which won |
| `GET /api/daemon/memory/pull` | Cursor-paginated notes changed since `(updatedAt, id)` |

## Files

| Path | Change |
|---|---|
| `packages/shared/src/cloud.ts` | edit — sync payload/response types, `MEMORY_SYNC_DEBOUNCE_MS`, `MEMORY_SYNC_SWEEP_MS` |
| `apps/web/src/app/api/daemon/memory/push/route.ts` | new — batch upsert, hash-first LWW, enqueues `memory.sync` commands |
| `apps/web/src/app/api/daemon/memory/pull/route.ts` | new — cursor-paginated pull |
| `packages/core/src/db/schema.ts` + `migrations.ts` | edit — `memory_notes.synced_hash` / `synced_at`, migration `0018` |
| `packages/core/src/cloud/memory-sync.ts` | new — push hook + debounce + sweep; pull sweep + command handling |
| `packages/core/src/cloud/commands.ts` | edit — dispatch `memory.sync` to the pull sweep |
| `packages/core/src/memory/vault.ts` | edit — hook point after `writeNote()`/`writeNoteRaw()`; dedicated pulled-note writer |
| `packages/core/src/index.ts` | edit — start/stop memory-sync beside the transcript pusher |

## Traps

**A pulled note must not clobber an un-pushed local edit.** If the local row's
`contentHash` differs from its own `syncedHash` (an edit is waiting to be
pushed) AND the incoming pulled note's hash also differs from local, that is
the real conflict decision 2 describes — resolve it by `updatedAt`, but do not
apply a pulled note over local content without checking `syncedHash` first,
or a slow push queue can lose a local edit to a pull that merely arrived
faster.

**`lastWriterRuntimeId` is documented as informational, not a filter.** Do not
use it to skip pulling a machine's own writes — the hash-equality
short-circuit already makes that case a free no-op, and filtering by writer
identity would break the one case that actually needs a re-pull: this
machine's local copy of its own note being deleted or corrupted externally.

**The push hook fires from exactly two functions.** If a future feature adds
a THIRD way to mutate `memory_notes` content without going through
`writeNote()`/`writeNoteRaw()`, that path silently never syncs until the next
reconciliation sweep notices the hash mismatch — which it will, eventually,
but "eventually" is `MEMORY_SYNC_SWEEP_MS`, not "after the write." New mutation
paths should call the hook directly rather than relying on the sweep alone.

**Do not let either sweep hold the process open.** Same `unref()` requirement
as every other timer in this codebase, for the same reason.

**The debounce queue is in-memory and does not survive a restart** — by
design, matching `transcripts.ts`'s live queue. The reconciliation sweep is
what makes that survivable, not an oversight to fix.

## Verification

Full procedure in [T-M6-05](T-M6-05-verification.md). The assertions that
matter:

1. **A note saved on A appears on B**, same id, same path, indexed, returned
   by `memory_search` on B.
2. **B computed its own embedding** — assert this from the cloud schema
   having no vector column, and confirm no request from B's push carries one.
3. **An offline machine catches up** on its own once reconnected, via the
   sweep, with no command needed.
4. **A genuine conflict — both machines edit while split — resolves without
   an error and without a duplicate file.**
