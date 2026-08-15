import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, inArray, isNull, ne, or } from "drizzle-orm";
import {
  MEMORY_PULL_PAGE_SIZE,
  MEMORY_PUSH_MAX_NOTES,
  MEMORY_SYNC_DEBOUNCE_MS,
  MEMORY_SYNC_SWEEP_MS,
  type MemoryNoteSyncPayload,
  type MemoryPullCursor,
  type MemoryPullResponse,
  type MemoryPushResponse,
  type MemoryScopeKind,
} from "@sparstrow/shared";
import { getDb } from "../db/connection.js";
import { memoryNotes, settings } from "../db/schema.js";
import { logger } from "../logger.js";
import { indexer } from "../memory/indexer.js";
import { noteSelfWrite, setNoteWriteHook, toAbsPath } from "../memory/vault.js";
import { CloudAuthError, cloudFetch, invalidatePairingCache, isPaired } from "./client.js";

/**
 * M6 — memory notes across machines: push what this one wrote, pull what the
 * others did.
 *
 * Both halves live here because they share the one thing that must not exist
 * twice: `applyPulledNote()`. A note this machine edited and a note the cloud
 * says is newer can race, and push's "you lost last-write-wins" path and pull's
 * ordinary path have to resolve that race the SAME way. Two copies of that
 * comparison would drift, and the symptom would be a user's note quietly
 * reverting on one machine and not the other.
 *
 * Shape borrowed wholesale from `transcripts.ts`, deliberately: fast path for
 * latency (a debounce here, a command doorbell there), sweep for correctness,
 * connectivity logged on the transition and never per attempt. A second set of
 * rules for the same failures is how two subsystems end up disagreeing about
 * whether this machine is paired.
 */

const SETTING_PULL_AT = "memory.pulledThroughUpdatedAt";
const SETTING_PULL_ID = "memory.pulledThroughId";

const EPOCH = new Date(0).toISOString();

/**
 * Ceiling on how many stale notes one sweep may queue.
 *
 * Well above `MEMORY_PUSH_MAX_NOTES`, because these are two different limits:
 * that one bounds a REQUEST, this one bounds a sweep's reach, and the debounced
 * loop drains the queue in request-sized batches on its own. Sized so the
 * one-time cost of a machine joining the sync — every note reads as never
 * synced — clears in a single sweep for any realistic vault, instead of
 * trickling out at a few hundred notes per five minutes for hours.
 *
 * It is still a ceiling rather than an unbounded scan: the query is an indexed
 * read, but holding an entire pathological vault's ids in memory at once is not
 * something a background sweep should ever do.
 */
const SWEEP_MAX_NOTES = 2_000;

const nowIso = () => new Date().toISOString();
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Note ids known to owe the cloud a push. In memory by design — see the sweep. */
const pending = new Set<string>();

let debounceTimer: NodeJS.Timeout | null = null;
let sweepTimer: NodeJS.Timeout | null = null;
let stopped = true;
/** Connectivity edge, so a laptop offline overnight logs once rather than hourly. */
let healthy = true;
/** One push in flight at a time — memory writes are not a firehose. */
let pushing = false;
let pulling = false;
/** Ids refused for a reason retrying cannot fix. Logged once each, not per sweep. */
const refused = new Set<string>();

// ─── The hook ────────────────────────────────────────────────────────────────

/**
 * "This note's content changed." Called from `writeNote()` and `writeNoteRaw()`
 * — the two functions every current mutation path funnels through.
 *
 * Fire-and-forget from the caller's perspective, and that is a requirement
 * rather than a nicety: both callers sit on the hot path of API request
 * handlers, and a synchronous network call here would make an unrelated
 * response wait on cloud reachability.
 *
 * Safe to call on an unpaired machine. Nothing is scheduled, and the id is not
 * remembered — a machine that pairs later has its whole vault found by the
 * first reconciliation sweep anyway, because `synced_hash` is NULL on every row
 * that predates the pairing.
 */
export function markNoteDirty(noteId: string): void {
  if (stopped || !isPaired()) return;
  pending.add(noteId);
  scheduleDebounce();
}

function scheduleDebounce(): void {
  if (debounceTimer || stopped) return;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void pushPending();
  }, MEMORY_SYNC_DEBOUNCE_MS);
  debounceTimer.unref?.();
}

// ─── Push ────────────────────────────────────────────────────────────────────

type NoteRow = typeof memoryNotes.$inferSelect;

/**
 * A local row plus its file, as the wire wants it.
 *
 * `content` is the WHOLE file, frontmatter included, and `contentHash` is
 * computed from those exact bytes — see the long note on
 * `MemoryNoteSyncPayload`. Sending a re-rendered body instead would give every
 * machine a different hash for the same note and make the two trade writes
 * forever.
 *
 * Returns null when the file and the row disagree about the hash. That means an
 * external edit the watcher has not reconciled yet; `scanVault()` will update
 * the row and re-mark the note dirty within moments, and pushing now would ship
 * content whose metadata (title, tags, updatedAt) is stale. Skipping is
 * self-healing — the note stays dirty and the next sweep finds it agreeing.
 */
function toPayload(row: NoteRow): MemoryNoteSyncPayload | null {
  let content: string;
  try {
    content = fs.readFileSync(toAbsPath(row.path), "utf8");
  } catch {
    // Deleted or unreadable. `scanVault()` removes rows for files that vanished;
    // pushing a note whose file is gone would publish a stale copy to every
    // other machine.
    return null;
  }

  const hash = sha256(content);
  if (hash !== row.contentHash) return null;

  return {
    id: row.id,
    path: row.path,
    scope: row.scope as MemoryNoteSyncPayload["scope"],
    projectSlug: row.projectSlug,
    agentSlug: row.agentSlug,
    title: row.title,
    tags: row.tags,
    source: row.source,
    type: row.type,
    content,
    quarantined: row.quarantined,
    archivedAt: row.archivedAt,
    supersededBy: row.supersededBy,
    contentHash: hash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function markSynced(noteId: string, sentHash: string): void {
  // `sentHash`, never a fresh read of the row. The note may have been edited
  // again between building this batch and the response arriving, and re-reading
  // `contentHash` here would mark that newer, unpushed edit as synced — the one
  // way this design can silently lose a user's writing.
  getDb()
    .update(memoryNotes)
    .set({ syncedHash: sentHash, syncedAt: nowIso() })
    .where(eq(memoryNotes.id, noteId))
    .run();
}

async function pushPending(): Promise<void> {
  if (stopped || pushing || !isPaired() || pending.size === 0) return;

  // Snapshot and remove in one step. A note marked dirty AFTER this line — by a
  // second edit while the request below is in flight — lands back in `pending`
  // and rides the next cycle, rather than being absorbed into a payload that
  // was already serialised.
  const batchIds = [...pending].slice(0, MEMORY_PUSH_MAX_NOTES);
  for (const id of batchIds) pending.delete(id);

  const rows = getDb().select().from(memoryNotes).where(inArray(memoryNotes.id, batchIds)).all();

  const notes: MemoryNoteSyncPayload[] = [];
  for (const row of rows) {
    const payload = toPayload(row);
    if (payload) notes.push(payload);
    // A row that yielded nothing is deliberately NOT re-queued here: it is
    // waiting on `scanVault()`, which re-marks it dirty itself once the file and
    // the row agree. Re-queueing would spin this loop against a file that is not
    // ready.
  }

  if (notes.length === 0) {
    if (pending.size > 0) scheduleDebounce();
    return;
  }

  const sentHashes = new Map(notes.map((n) => [n.id, n.contentHash]));
  pushing = true;

  try {
    const response = await cloudFetch<MemoryPushResponse>("/memory/push", {
      body: { notes },
      retries: 1,
    });

    pushing = false;

    if (!healthy) {
      healthy = true;
      logger.info("cloud control plane reachable again");
      // Failing→reachable: whatever arrived from other machines while this one
      // was cut off is fetched now rather than waiting out a full sweep.
      void pullOnce();
    }

    for (const result of response.results ?? []) {
      const sent = sentHashes.get(result.id);
      if (!sent) continue;

      if (result.applied) {
        markSynced(result.id, sent);
        continue;
      }

      if (result.current) {
        // Lost last-write-wins. The cloud handed back the winner so this
        // machine can converge immediately instead of waiting for a pull to
        // discover it — through the SAME writer the pull path uses, because
        // both are resolving the same race.
        applyPulledNote(result.current);
        continue;
      }

      // Refused with no winner to apply. The only route that does this is a
      // note id that belongs to another workspace, which cannot be fixed by
      // retrying. Logged once per id rather than every sweep.
      if (!refused.has(result.id)) {
        refused.add(result.id);
        logger.warn(
          { noteId: result.id },
          "the control plane refused a memory note and offered no newer version — it will not sync",
        );
      }
    }

    if (pending.size > 0) {
      // More waiting, most often because the batch hit its ceiling. Go again
      // rather than idling out a full debounce for work already in hand.
      void pushPending();
    }
  } catch (err) {
    // Nothing was confirmed, so everything in this batch is still dirty.
    for (const id of batchIds) pending.add(id);

    if (err instanceof CloudAuthError) {
      if (err.revoked) {
        logger.warn(
          "this machine's pairing was revoked — stopping memory sync. Run `sparstrow pair <code>` to reconnect.",
        );
        stopMemorySync();
        return;
      }
      invalidatePairingCache();
      if (!isPaired()) {
        logger.warn("daemon token is no longer valid — stopping memory sync until re-paired");
        stopMemorySync();
        return;
      }
      scheduleDebounce();
      return;
    }

    if (healthy) {
      healthy = false;
      logger.warn(
        { detail: err instanceof Error ? err.message : String(err) },
        "could not push memory notes — retrying in the background",
      );
    }
    scheduleDebounce();
  } finally {
    pushing = false;
  }
}

/**
 * Reconciliation: every note whose confirmed hash is not its current one.
 *
 * `synced_hash IS NULL OR synced_hash != content_hash` — the IS NULL leg is
 * load-bearing rather than defensive. SQL comparison against NULL is NULL, not
 * true, so without it every note predating migration 0018 (which is all of
 * them, on the first boot after upgrading) would be invisible to this query
 * forever.
 *
 * Routes through `markNoteDirty()` rather than pushing directly, so a sweep
 * that finds forty stale notes coalesces into the same debounced batching a
 * single live edit would — not a second push path with its own rules.
 */
function pushSweep(): void {
  if (stopped || !isPaired()) return;

  const stale = getDb()
    .select({ id: memoryNotes.id })
    .from(memoryNotes)
    .where(or(isNull(memoryNotes.syncedHash), ne(memoryNotes.syncedHash, memoryNotes.contentHash)))
    .limit(SWEEP_MAX_NOTES)
    .all();

  for (const row of stale) markNoteDirty(row.id);
}

// ─── The shared writer ───────────────────────────────────────────────────────

/**
 * Land a note the cloud says this machine should have.
 *
 * Called from BOTH the pull path and push's lost-last-write-wins path. There is
 * exactly one copy of this comparison on purpose: two would drift, and the
 * symptom would be a note that reverts on one machine and not the other.
 *
 * Identity travels verbatim — the note keeps the `id` and `path` its origin
 * machine minted. Emphatically NOT `writeNote()`, which mints a fresh id and a
 * fresh filename on every call: using it here would give the same cloud note a
 * different identity on every machine, break the cloud's own
 * `uq_memory_notes_workspace_path` the moment this machine pushed back, and
 * leave a visible duplicate file behind on every re-pull.
 */
export function applyPulledNote(remote: MemoryNoteSyncPayload): void {
  // The hash is not taken on trust. Every decision below — the no-op
  // short-circuit, the conflict comparison, and what gets written into
  // `synced_hash` — assumes `contentHash === sha256(content)`, and a payload
  // where that is false would poison all three: the note would be stored with a
  // hash matching no file, read as permanently dirty, and pushed back forever.
  // One hash of content already in memory is cheap next to that.
  if (sha256(remote.content) !== remote.contentHash) {
    logger.warn(
      { noteId: remote.id },
      "a pulled memory note's hash did not match its content — skipping it",
    );
    return;
  }

  const db = getDb();
  const local = db.select().from(memoryNotes).where(eq(memoryNotes.id, remote.id)).get();

  if (local) {
    // Hash-equal: nothing to do, and checked BEFORE any clock comparison. This
    // is what makes a machine pulling back its own writes free, and it is why
    // the pull query does not filter on `lastWriterRuntimeId`.
    if (local.contentHash === remote.contentHash) return;

    // A local edit is still waiting to be pushed. Only overwrite it if the
    // incoming version is unambiguously newer — a tie leaves the local edit
    // alone and lets the push path correct the cloud instead. Without this, a
    // slow push queue loses a user's edit to a pull that merely arrived first.
    if (local.contentHash !== (local.syncedHash ?? "")) {
      if (!(Date.parse(remote.updatedAt) > Date.parse(local.updatedAt))) return;
    }
  }

  // The path is a UNIQUE column locally. A different note already sitting there
  // means the two machines disagree about identity — refuse rather than
  // clobber, and say so once.
  const atPath = db.select().from(memoryNotes).where(eq(memoryNotes.path, remote.path)).get();
  if (atPath && atPath.id !== remote.id) {
    if (!refused.has(remote.id)) {
      refused.add(remote.id);
      logger.warn(
        { noteId: remote.id, path: remote.path, localNoteId: atPath.id },
        "a pulled note's vault path is already held by a different note — skipping it rather than overwriting",
      );
    }
    return;
  }

  const absPath = toAbsPath(remote.path);
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, remote.content, "utf8");
  } catch (err) {
    logger.warn({ err, path: remote.path }, "could not write a pulled memory note to the vault");
    return;
  }
  // The watcher must not treat this as an external edit and re-derive metadata
  // from it — same suppression every other writer in `vault.ts` uses.
  noteSelfWrite(remote.path, remote.contentHash);

  const row: typeof memoryNotes.$inferInsert = {
    id: remote.id,
    path: remote.path,
    scope: remote.scope as MemoryScopeKind,
    projectSlug: remote.projectSlug,
    agentSlug: remote.agentSlug,
    title: remote.title,
    tags: remote.tags,
    source: remote.source,
    type: remote.type,
    quarantined: remote.quarantined,
    archivedAt: remote.archivedAt,
    supersededBy: remote.supersededBy,
    contentHash: remote.contentHash,
    // Never indexed here. Chunks, FTS rows and vectors are rebuilt locally from
    // the markdown by the indexer below, with THIS machine's embedding model —
    // which is the entire reason no vector ever crosses the wire.
    indexedAt: null,
    // Synced by definition: these bytes came from the cloud, so this machine
    // owes it nothing for them.
    syncedHash: remote.contentHash,
    syncedAt: nowIso(),
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
  };

  const { id: _id, ...updatable } = row;
  db.insert(memoryNotes)
    .values(row)
    .onConflictDoUpdate({ target: memoryNotes.id, set: updatable })
    .run();

  indexer.enqueue([remote.id]);
}

// ─── Pull ────────────────────────────────────────────────────────────────────

function readPullCursor(): MemoryPullCursor {
  const rows = getDb()
    .select()
    .from(settings)
    .where(inArray(settings.key, [SETTING_PULL_AT, SETTING_PULL_ID]))
    .all();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    updatedAt: byKey.get(SETTING_PULL_AT) ?? EPOCH,
    id: byKey.get(SETTING_PULL_ID) ?? "",
  };
}

function writePullCursor(cursor: MemoryPullCursor): void {
  const db = getDb();
  for (const [key, value] of [
    [SETTING_PULL_AT, cursor.updatedAt],
    [SETTING_PULL_ID, cursor.id],
  ] as const) {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }
}

/**
 * Everything this workspace changed since the cursor, one page at a time.
 *
 * The cursor advances only AFTER a page's writes have all landed, never
 * mid-page. A crash in between replays that page on the next sweep, which costs
 * a handful of hash comparisons because `applyPulledNote()` is idempotent —
 * whereas advancing first would skip whatever had not been written yet, with
 * nothing left to notice the gap.
 */
export async function pullOnce(): Promise<void> {
  if (stopped || pulling || !isPaired()) return;
  pulling = true;

  try {
    for (;;) {
      const cursor = readPullCursor();
      const query = new URLSearchParams({
        since: cursor.updatedAt,
        sinceId: cursor.id,
        limit: String(MEMORY_PULL_PAGE_SIZE),
      });

      const page = await cloudFetch<MemoryPullResponse>(`/memory/pull?${query}`, {
        method: "GET",
        retries: 1,
      });

      if (!healthy) {
        healthy = true;
        logger.info("cloud control plane reachable again");
      }

      for (const note of page.notes ?? []) applyPulledNote(note);

      const next = page.nextCursor;
      if (!next) return; // caught up — the server said so by returning a short page

      // A cursor that did not move would loop this forever against the same
      // page. It should be impossible (the server builds it from the last row it
      // returned), but "should be impossible" is not a reason to write a loop
      // with no exit.
      if (next.updatedAt === cursor.updatedAt && next.id === cursor.id) {
        logger.warn({ cursor: next }, "memory pull cursor did not advance — stopping this pass");
        return;
      }

      writePullCursor(next);
    }
  } catch (err) {
    if (err instanceof CloudAuthError) {
      if (err.revoked) {
        logger.warn(
          "this machine's pairing was revoked — stopping memory sync. Run `sparstrow pair <code>` to reconnect.",
        );
        stopMemorySync();
        return;
      }
      invalidatePairingCache();
      if (!isPaired()) {
        logger.warn("daemon token is no longer valid — stopping memory sync until re-paired");
        stopMemorySync();
      }
      return;
    }

    if (healthy) {
      healthy = false;
      logger.warn(
        { detail: err instanceof Error ? err.message : String(err) },
        "could not pull memory notes — retrying in the background",
      );
    }
  } finally {
    pulling = false;
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

function sweep(): void {
  if (stopped || !isPaired()) return;
  pushSweep();
  void pullOnce();
}

/**
 * Start both halves. Safe on an unpaired machine — every entry point checks
 * `isPaired()`, so the timers run and do nothing until a pairing appears, which
 * is what lets `sparstrow pair` be noticed without a restart.
 */
export function startMemorySync(): void {
  if (sweepTimer) return;
  stopped = false;
  healthy = true;
  pushing = false;
  pulling = false;

  // Registered rather than imported by the vault — see `setNoteWriteHook`.
  setNoteWriteHook(markNoteDirty);

  // Startup is one of the three pull triggers, alongside failing→reachable and
  // the periodic tick. Cheap when there is nothing to find.
  sweep();

  sweepTimer = setInterval(sweep, MEMORY_SYNC_SWEEP_MS);
  // Without unref this keeps Node alive and turns a clean exit into a hang.
  sweepTimer.unref?.();
}

export function stopMemorySync(): void {
  stopped = true;
  setNoteWriteHook(null);
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/** Test seam. */
export function resetMemorySync(): void {
  stopMemorySync();
  pending.clear();
  refused.clear();
  healthy = true;
  pushing = false;
  pulling = false;
}

/** Test seam: what is currently believed to owe the cloud a push. */
export function pendingNoteIds(): string[] {
  return [...pending];
}
