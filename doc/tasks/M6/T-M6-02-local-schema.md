# T-M6-02 — Local schema: sync state + pull cursor

| | |
|---|---|
| **Tag** | `[P]` parallel — pure SQLite, no dependency on the HTTP contract |
| **Depends on** | — |
| **Blocks** | T-M6-03, T-M6-04, T-M6-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Two columns on local `memory_notes`, migration `0018`. Nothing else — phase
decision 7 deliberately puts the pull cursor in the existing `settings` table
rather than a new one, so this task is smaller than its title suggests.

## Decisions already made

**`syncedHash` / `syncedAt`, nullable, no default.** `NULL` on both means
"never pushed" — true for every note that predates this migration, which is
exactly the state that should make the reconciliation sweep pick them all up
on first boot after upgrade. Do not backfill these from `contentHash`/
`updatedAt` in the migration; that would mean "this machine's entire existing
vault is considered already synced," which is false the first time this
machine ever pairs.

**The pull cursor is two `settings` rows, not a table** — phase decision 7.
`memory.pulledThroughUpdatedAt` and `memory.pulledThroughId`, read/written
through the same upsert `T-M4-04`'s `settings.set` handler already uses.
This task does not need to touch `commands.ts`'s allowlist — that allowlist
governs remote writes FROM the cloud; these two keys are written locally, by
the pull sweep itself, never by an incoming command.

## Checklist

- [ ] `synced_hash TEXT`, `synced_at TEXT` added to `memoryNotes` in `packages/core/src/db/schema.ts`
- [ ] Migration `0018` in `packages/core/src/db/migrations.ts` — `ALTER TABLE memory_notes ADD COLUMN synced_hash TEXT; ALTER TABLE memory_notes ADD COLUMN synced_at TEXT;`
- [ ] `packages/core/src/db/migration-0018.test.ts`, matching the shape of `migration-0017.test.ts`
- [ ] Confirm SQLite's `ALTER TABLE ADD COLUMN` on an existing populated `memory_notes` table is additive and safe (it is — SQLite fills the new column with `NULL` for every existing row, which is the correct "never synced" state) — assert this against a populated table in the test, not just a fresh one

## Traps

**Do not add a `NOT NULL DEFAULT ''` to `synced_hash`.** An empty string is
not a valid hash and is not equal to any real `contentHash`, so it would
still correctly trigger a sync — but it reads as "synced to nothing," which
is a confusing thing to find in a debugger next to a `NULL`-means-the-same
-thing convention everywhere else in this schema (`indexedAt`, `archivedAt`).
`NULL` says what it means.

**This migration must not touch `memory_chunks`, `memory_fts`, or
`memory_vec`.** Phase decision 3 is that these are never synced and never
need sync-state columns of their own — a reviewer adding one "for
consistency" would be adding dead columns.

## Verification

- [ ] Migration test green against a fresh and a populated `memory_notes` table
- [ ] `pnpm -r typecheck` clean

## On completion

- [ ] Tick 8.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
