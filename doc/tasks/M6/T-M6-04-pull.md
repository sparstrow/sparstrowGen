# T-M6-04 — Pull: command-triggered + full sweep

| | |
|---|---|
| **Tag** | `[C]` concurrent — shares `memory-sync.ts` with 03; one worker at a time on that file |
| **Depends on** | T-M6-01, T-M6-02 |
| **Blocks** | T-M6-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-12 |

## Objective

`packages/core/src/cloud/memory-sync.ts` (pull half) — the dedicated writer
that lands a foreign note in the vault under its ORIGINAL id and path, the
`memory.sync` command handler that pulls on demand, and the periodic sweep
that guarantees eventual delivery without one.

## Decisions already made

**Identity travels verbatim — phase decision 1.** The pull writer is not
`writeNote()`. It writes to `path` exactly as the cloud row states (relative
to the vault root), with `id` carried into the local `memory_notes` row
unchanged. Closer in shape to `scanVault()`'s reconciliation than to a
create path:

```ts
async function applyPulledNote(remote: MemoryNoteSyncPayload): Promise<void> {
  const local = getNoteById(remote.id); // by id, not by path
  if (local && local.contentHash !== local.syncedHash) {
    // Un-pushed local edit in flight. Phase decision 2: only apply the
    // pulled version if it is unambiguously newer than the LOCAL edit.
    if (!(remote.updatedAt > local.updatedAt)) return; // local wins or ties; let push correct the cloud instead
  }
  if (local && local.contentHash === remote.contentHash) return; // hash-equal short-circuit — nothing to do
  writeVaultFile(remote.path, renderFrontmatter(remote) + remote.content);
  upsertLocalNoteRow(remote); // synced_hash = remote.contentHash, synced_at = now — this row is now considered synced BY DEFINITION, it came from the cloud
  indexer.enqueue([remote.id]);
}
```

**`memory.sync` is a new `CommandKind`, dispatched exactly like the other
three — phase decision 6.** Add it to `packages/shared/src/cloud.ts`'s
`CommandKind` union and to `commands.ts`'s dispatch switch. Its handler does
not need the command's payload (T-M6-01 defined it as empty) — it calls
the SAME pull-a-page-and-apply function the sweep calls, once. Ack `done`
regardless of whether anything new was found; a `memory.sync` command
finding nothing to pull is success, not failure.

**The pull sweep triggers on the same three events `T-M5-04` established for
backfill — reused deliberately, not reinvented:**

- startup (paired, unconditionally — cheap to run even with nothing to find)
- the failing→reachable transition (this loop's OWN `healthy` flag, not
  transcripts.ts's — each subsystem manages its own connectivity signal)
- a periodic tick, `MEMORY_SYNC_SWEEP_MS`

**Pull one page at a time, advancing the cursor only after a page's writes
all land — never mid-page.** A crash between writing page N's notes and
advancing the cursor replays page N entirely on the next sweep; every write
in `applyPulledNote()` is idempotent (hash-equal short-circuit), so a
replayed page costs a few no-op comparisons, not a duplicate.

```ts
async function pullOnce(): Promise<void> {
  for (;;) {
    const { updatedAt, id } = readPullCursor();
    const page = await cloudFetch<MemoryPullResponse>(
      `/memory/pull${qs({ since: updatedAt, sinceId: id, limit: MEMORY_PULL_PAGE_SIZE })}`,
    );
    for (const note of page.notes) await applyPulledNote(note);
    if (page.nextCursor) writePullCursor(page.nextCursor);
    if (!page.nextCursor || page.notes.length < MEMORY_PULL_PAGE_SIZE) return; // caught up
  }
}
```

## Checklist

- [x] `applyPulledNote()` — dedicated writer, id/path verbatim, hash-equal short-circuit, local-edit-in-flight guard
- [x] `CommandKind` gains `"memory.sync"` in `packages/shared/src/cloud.ts`
- [x] `commands.ts`'s dispatch switch handles it: pull once, ack `done`
- [x] `pullOnce()` pages via the cursor in `settings` (`T-M6-02`), advances only after each page's writes land
- [x] Sweep triggers: startup, failing→reachable, `MEMORY_SYNC_SWEEP_MS` interval
- [x] `unref()` on the sweep timer; nothing runs when unpaired
- [x] Every pulled note is indexed (`indexer.enqueue`), never left un-indexed
- [x] Unit tests: writes to the exact `path`/`id` from the cloud, not a new one; a hash-equal pull is a no-op; a genuine remote-newer conflict overwrites and re-indexes; a local-edit-in-flight is NOT clobbered by an older-or-equal pull; a crash mid-page (cursor not advanced) replays safely; `memory.sync` command dispatch calls pull and acks `done`; sweep triggers on all three events

## Traps

**Do not use `writeNote()` or `writeNoteRaw()` for a pulled note.** Both mint
fresh identity — the entire point of decision 1. If a future change makes
that temptingly convenient (e.g., to reuse frontmatter-rendering logic),
extract just the rendering, not the whole write path.

**The local-edit-in-flight guard is the one place this task and `T-M6-03`
truly share a race.** A note dirty-but-not-yet-pushed locally, and a pull
landing for the SAME note at the same moment, must agree on who wins using
the SAME comparison — implement `applyPulledNote()` once, call it from both
the sweep/command path here AND from `T-M6-03`'s `applied: false` handling,
rather than two copies that can drift.

**`lastWriterRuntimeId` is not a filter — see the phase README's trap.** Do
not skip pulling a note because `lastWriterRuntimeId` matches this machine's
own runtime id; the hash-equal short-circuit already makes that case free,
and filtering by identity would break re-pulling this machine's own note
after an external deletion of its local file.

**A `memory.sync` command's ack must not be `failed` just because the pull
found nothing new.** That is the expected, common case — only a genuine
error (auth, network exhaustion) is a `failed` ack.

## Verification

- [x] Unit tests green
- [ ] Live pull via command dispatch, live pull via the sweep on a previously-offline machine, and a genuine cross-machine conflict → **T-M6-05**

## On completion

- [x] Tick 8.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
