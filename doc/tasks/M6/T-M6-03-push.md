# T-M6-03 — Push: hook + reconciliation sweep

| | |
|---|---|
| **Tag** | `[P]` parallel — shares `memory-sync.ts` with 04; one worker at a time on that file |
| **Depends on** | T-M6-01, T-M6-02 |
| **Blocks** | T-M6-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-12 |

## Objective

`packages/core/src/cloud/memory-sync.ts` (push half) — the hook that fires
after a local note write, the debounce that coalesces a burst of them, and
the sweep that catches whatever the hook missed.

## Decisions already made

**One hook, two call sites — phase decision 5.** Every mutation to a note's
content or metadata goes through `writeNote()` or `writeNoteRaw()` in
`packages/core/src/memory/vault.ts` (confirmed exhaustively against every
current caller: `POST /memory/notes`, `PUT /memory/notes/:id/raw`, the
`memory_save` MCP tool via `agent-memory.ts`, dream-cycle signal extraction
and synthesis-merge, and instance/variant template-note copying). Add the
hook at the end of each function, not at each of the six call sites — this
is what makes a future seventh caller sync for free.

```ts
export function markNoteDirty(noteId: string): void {
  pending.add(noteId);
  scheduleDebounce();
}
```

**Debounced, not immediate — `MEMORY_SYNC_DEBOUNCE_MS` (2s).** A rapid
sequence of `writeNoteRaw()` calls against the same note (an autosaving
editor) should produce one push carrying the final content, not one push per
keystroke-adjacent save. `pending` is a `Set<string>` of dirty note ids;
the debounce timer, on firing, reads every current note row for those ids
and pushes them as one batch.

**One in-flight push at a time, not one per note.** Unlike `transcripts.ts`'s
per-run queues, there is exactly one debounce timer and one in-flight
request for the whole push path — memory writes are not a firehose the way
run events are, and batching everything pending into one request is both
simpler and cheaper than per-note concurrency here would be.

**Mirror the heartbeat's failure behaviour, exactly, again:**

- 403 → stop permanently, log once, name re-pairing as the fix
- 401 → re-read the token, retry if still paired
- network / 5xx → back off, log the *transition*, keep trying — and do NOT
  drop `pending`; a failed push leaves those note ids dirty for the next
  attempt
- `unref()` the timer

**On a response, apply `MemoryPushResult` per note — do not just trust that
"the request succeeded" means "everything applied."** For each result:

- `applied: true` → set `syncedHash = contentHash` (the value that WAS sent,
  not re-read from the row — the row may have changed again since), `syncedAt
  = now`.
- `applied: false` → this machine's version lost LWW. `result.current` is the
  cloud's newer row — write it into the vault via the SAME pulled-note writer
  `T-M6-04` builds (do not duplicate that logic here; import it), then
  `indexer.enqueue([noteId])`. This is the one case where push and pull
  genuinely share code, not just a file.

**The reconciliation sweep (`MEMORY_SYNC_SWEEP_MS`, 5 min) queries local
`memory_notes` for `contentHash IS NOT synced_hash` (SQLite: `synced_hash IS
NULL OR synced_hash != content_hash`) and calls `markNoteDirty()` for each —
it does not push directly.** Routing through the same dirty-set means a sweep
finding 40 stale notes coalesces into the SAME one debounced batch a live
edit would have, rather than a second, parallel push path with its own
batching rules.

## Checklist

- [x] `markNoteDirty()`, called from `writeNote()` and `writeNoteRaw()` in `vault.ts`
- [x] Debounce timer, `MEMORY_SYNC_DEBOUNCE_MS`, coalesces the pending set into one batch
- [x] `startMemorySync()` / `stopMemorySync()`, wired into `packages/core/src/index.ts`
- [x] Does nothing when unpaired — no timers, no log noise
- [x] 403/401/network/5xx handled exactly as above; failed push does not drop `pending`
- [x] `applied: false` results write the winning cloud version locally and re-index
- [x] Reconciliation sweep on `MEMORY_SYNC_SWEEP_MS`, routes through `markNoteDirty()`, not a second push path
- [x] `unref()` on both the debounce timer and the sweep interval
- [x] Unit tests with fake timers: debounces a burst into one request; a failed push keeps the note dirty for the next attempt; an `applied:false` result writes the winning version and re-indexes; the sweep finds a hash-mismatched note and pushes it; stops on 403; a note whose `synced_hash` already matches is never pushed

## Traps

**Do not push from inside `writeNote()`/`writeNoteRaw()` synchronously.**
Those functions are on the hot path of every note mutation, including
request handlers; a synchronous network call there would make an unrelated
API response wait on cloud reachability. `markNoteDirty()` must be
fire-and-forget from the caller's perspective.

**The dirty set must survive across debounce cycles cleanly.** Reading
`pending`, snapshotting it into a batch, and clearing it are three separate
moments — a note marked dirty WHILE a batch is being built (but after the
snapshot was taken) must survive into the NEXT batch, not be lost because it
technically "was in `pending`" when the timer fired.

**A note can go dirty again while its own push is in flight** (a fast second
edit). Do not let that get absorbed into the in-flight request's payload
after it was already serialized — it should simply re-mark dirty and ride
the next debounce cycle.

**`syncedHash` is set to what was SENT, never re-read from the row after the
fact.** The row may have been edited again between when the batch was built
and when the response arrived; re-reading `contentHash` at that point would
mark a NEWER, unpushed edit as synced.

## Verification

- [x] Unit tests green
- [ ] Live push, crash-then-sweep recovery, and a real LWW loss → **T-M6-05**

## On completion

- [x] Tick 8.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
