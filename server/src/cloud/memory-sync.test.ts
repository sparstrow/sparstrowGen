import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEMORY_SYNC_DEBOUNCE_MS,
  MEMORY_SYNC_SWEEP_MS,
  type MemoryNoteSyncPayload,
} from "@sparstrow/shared";
import { config } from "../config.js";
import { closeDb, getSqlite, openDb } from "../db/connection.js";
import { invalidatePairingCache, saveConnection } from "./client.js";
import {
  applyPulledNote,
  markNoteDirty,
  pendingNoteIds,
  pullOnce,
  resetMemorySync,
  startMemorySync,
  stopMemorySync,
} from "./memory-sync.js";

/**
 * M6 — the daemon side of memory sync.
 *
 * The indexer is stubbed throughout: `indexNote()` chunks, writes FTS rows and
 * calls the embedder, whose first invocation downloads a model. What matters
 * here is that a pulled note IS handed to it — that the note arrives as
 * markdown to be indexed locally rather than pre-chunked — which the spy
 * asserts directly.
 */
const enqueued: string[][] = [];
vi.mock("../memory/indexer.js", () => ({
  indexer: {
    enqueue: (ids: string[]) => {
      enqueued.push(ids);
    },
  },
}));

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Every push accepted, every pull empty, unless a handler overrides. */
function routeFetch(handlers: Record<string, (init: RequestInit) => Response> = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    for (const [fragment, respond] of Object.entries(handlers)) {
      if (url.includes(fragment)) return respond((init ?? {}) as RequestInit);
    }
    if (url.includes("/memory/pull")) return jsonResponse(200, { notes: [], nextCursor: null });
    const body = JSON.parse(String((init as RequestInit)?.body ?? "{}")) as {
      notes: MemoryNoteSyncPayload[];
    };
    return jsonResponse(200, {
      results: (body.notes ?? []).map((n) => ({ id: n.id, applied: true })),
    });
  });
}

/** The note batches actually pushed, in call order. */
function pushed(mock: ReturnType<typeof routeFetch>): MemoryNoteSyncPayload[][] {
  return (mock.mock.calls as unknown as Array<[string, RequestInit]>)
    .filter(([url]) => String(url).includes("/memory/push"))
    .map(([, init]) => (JSON.parse(String(init.body)) as { notes: MemoryNoteSyncPayload[] }).notes);
}

/** The one batch a test expects to have been pushed. Fails loudly if there was none. */
function onlyBatch(mock: ReturnType<typeof routeFetch>): MemoryNoteSyncPayload[] {
  const batches = pushed(mock);
  expect(batches.length, "expected exactly one push").toBe(1);
  return batches[0] as MemoryNoteSyncPayload[];
}

/** The single note a test expects to have been pushed, on its own. */
function onlyNote(mock: ReturnType<typeof routeFetch>): MemoryNoteSyncPayload {
  const batch = onlyBatch(mock);
  expect(batch.length, "expected exactly one note in the push").toBe(1);
  return batch[0] as MemoryNoteSyncPayload;
}

function pullUrls(mock: ReturnType<typeof routeFetch>): string[] {
  return (mock.mock.calls as unknown as Array<[string]>)
    .map(([url]) => String(url))
    .filter((url) => url.includes("/memory/pull"));
}

let vault: string;

/** A note on disk plus its row, as `writeNote()` would have left them. */
function seedNote(
  id: string,
  content: string,
  over: Partial<{ relPath: string; syncedHash: string | null; updatedAt: string }> = {},
): { id: string; relPath: string; hash: string } {
  const relPath = over.relPath ?? `global/${id}.md`;
  const abs = path.join(vault, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
  const hash = sha256(content);
  const updatedAt = over.updatedAt ?? "2026-08-12T10:00:00.000Z";

  getSqlite()
    .prepare(
      `INSERT INTO memory_notes (id, path, scope, title, tags, source, type, content_hash, synced_hash, created_at, updated_at)
       VALUES (?, ?, 'global', ?, '[]', 'user', 'note', ?, ?, '2026-08-12T09:00:00.000Z', ?)`,
    )
    .run(id, relPath, `Title ${id}`, hash, over.syncedHash ?? null, updatedAt);

  return { id, relPath, hash };
}

function noteRow(id: string) {
  return getSqlite().prepare("SELECT * FROM memory_notes WHERE id = ?").get(id) as
    | {
        id: string;
        path: string;
        content_hash: string;
        synced_hash: string | null;
        synced_at: string | null;
        updated_at: string;
        title: string;
        indexed_at: string | null;
      }
    | undefined;
}

function remote(over: Partial<MemoryNoteSyncPayload> = {}): MemoryNoteSyncPayload {
  const content = over.content ?? "---\nid: mem_remote\n---\n\nfrom another machine\n";
  return {
    id: "mem_remote",
    path: "global/from-b.md",
    scope: "global",
    projectSlug: null,
    agentSlug: null,
    title: "From B",
    tags: [],
    source: "user",
    type: "note",
    quarantined: false,
    archivedAt: null,
    supersededBy: null,
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    ...over,
    content,
    contentHash: over.contentHash ?? sha256(content),
  };
}

describe("memory sync", () => {
  let dir: string;
  let originalSecretsDir: string;
  let originalCloudUrl: string;
  let originalVault: string;

  beforeEach(() => {
    vi.useFakeTimers();
    originalSecretsDir = config.secretsDir;
    originalCloudUrl = config.cloudUrl;
    originalVault = config.vaultPath;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-memsync-"));
    vault = path.join(dir, "vault");
    fs.mkdirSync(vault, { recursive: true });
    config.secretsDir = dir;
    config.cloudUrl = "http://cloud.test";
    config.vaultPath = vault;
    enqueued.length = 0;
    invalidatePairingCache();
    resetMemorySync();
    closeDb();
    openDb(":memory:");
  });

  afterEach(() => {
    resetMemorySync();
    vi.useRealTimers();
    vi.restoreAllMocks();
    config.secretsDir = originalSecretsDir;
    config.cloudUrl = originalCloudUrl;
    config.vaultPath = originalVault;
    fs.rmSync(dir, { recursive: true, force: true });
    invalidatePairingCache();
    closeDb();
  });

  // ─── Push ──────────────────────────────────────────────────────────────────

  describe("push", () => {
    it("does nothing on an unpaired machine — no timers, no requests", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      seedNote("mem_1", "hello");
      startMemorySync();
      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_SWEEP_MS * 2);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("debounces a burst of edits to one note into a single request", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "hello");
      const fetchMock = routeFetch();
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS / 4);
      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS / 4);
      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(onlyBatch(fetchMock).map((n) => n.id)).toEqual(["mem_1"]);
    });

    it("coalesces several dirty notes into one batch", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "one");
      seedNote("mem_2", "two");
      const fetchMock = routeFetch();
      startMemorySync();

      markNoteDirty("mem_1");
      markNoteDirty("mem_2");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(onlyBatch(fetchMock).map((n) => n.id).sort()).toEqual(["mem_1", "mem_2"]);
    });

    it("sends the WHOLE file, with a hash computed from exactly those bytes", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const file = "---\nid: mem_1\ntitle: Hello\n---\n\nthe body\n";
      const seeded = seedNote("mem_1", file);
      const fetchMock = routeFetch();
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      const note = onlyNote(fetchMock);
      // Frontmatter included, not a re-rendered body — this is what makes the
      // hash mean the same thing on every machine and stops the two trading
      // writes forever.
      expect(note.content).toBe(file);
      expect(note.contentHash).toBe(seeded.hash);
      expect(sha256(note.content)).toBe(note.contentHash);
    });

    it("never sends anything vector-shaped", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "hello");
      const fetchMock = routeFetch();
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      const note = onlyNote(fetchMock);
      expect(Object.keys(note).some((k) => /vec|embed/i.test(k))).toBe(false);
    });

    it("records syncedHash on an applied result, so the note stops being dirty", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const seeded = seedNote("mem_1", "hello");
      routeFetch();
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      const row = noteRow("mem_1");
      expect(row?.synced_hash).toBe(seeded.hash);
      expect(row?.synced_at).not.toBeNull();
      expect(pendingNoteIds()).toEqual([]);
    });

    it("keeps a note dirty across a failed push and lands it on a later attempt", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const seeded = seedNote("mem_1", "hello");
      let attempt = 0;
      const fetchMock = routeFetch({
        "/memory/push": (init) => {
          attempt++;
          // The first attempt is lost entirely. Nothing was confirmed, so the
          // note must survive as dirty rather than being spliced out of the
          // pending set on send.
          if (attempt === 1) return jsonResponse(500, {});
          const body = JSON.parse(String(init.body)) as { notes: MemoryNoteSyncPayload[] };
          return jsonResponse(200, {
            results: body.notes.map((n) => ({ id: n.id, applied: true })),
          });
        },
      });
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 8);

      expect(attempt).toBeGreaterThan(1);
      // Synced in the end — which is only possible if the failure left it dirty.
      expect(noteRow("mem_1")?.synced_hash).toBe(seeded.hash);
      expect(pendingNoteIds()).toEqual([]);
      expect(pushed(fetchMock)[0]?.map((n) => n.id)).toEqual(["mem_1"]);
    });

    it("never marks a note synced when the push was refused outright", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "hello");
      routeFetch({ "/memory/push": () => jsonResponse(500, {}) });
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 4);

      expect(noteRow("mem_1")?.synced_hash).toBeNull();
      expect(noteRow("mem_1")?.synced_at).toBeNull();
    });

    it("does not mark a note synced when the route reports it was not applied", async () => {
      // `applied: false` with no `current` — the route could not store the row.
      // Recording syncedHash here would tell this machine the cloud has content
      // it never took, and the note would never be retried.
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "hello");
      routeFetch({
        "/memory/push": () => jsonResponse(200, { results: [{ id: "mem_1", applied: false }] }),
      });
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(noteRow("mem_1")?.synced_hash).toBeNull();
    });

    it("stops permanently on a 403 — a revoked pairing is not a retryable error", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "hello");
      const fetchMock = routeFetch({
        "/memory/push": () => jsonResponse(403, { reason: "revoked", error: "gone" }),
      });
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);
      const afterRevoke = pushed(fetchMock).length;

      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_SWEEP_MS * 3);
      expect(pushed(fetchMock).length).toBe(afterRevoke);
    });

    it("applies the cloud's winner when this machine loses last-write-wins", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const seeded = seedNote("mem_1", "my version", { updatedAt: "2026-08-12T10:00:00.000Z" });
      const winner = remote({
        id: "mem_1",
        path: seeded.relPath,
        content: "their version",
        updatedAt: "2026-08-12T11:00:00.000Z",
      });
      routeFetch({
        "/memory/push": () =>
          jsonResponse(200, { results: [{ id: "mem_1", applied: false, current: winner }] }),
      });
      startMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      // Converged on the spot, through the same writer the pull path uses —
      // not left to wait for a pull sweep to discover the loss.
      expect(fs.readFileSync(path.join(vault, seeded.relPath), "utf8")).toBe("their version");
      const row = noteRow("mem_1");
      expect(row?.content_hash).toBe(winner.contentHash);
      expect(row?.synced_hash).toBe(winner.contentHash);
      expect(enqueued.flat()).toContain("mem_1");
    });
  });

  // ─── The reconciliation sweep ──────────────────────────────────────────────

  describe("reconciliation sweep", () => {
    it("finds a note that was never pushed — including every note predating M6", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_old", "written before this machine ever paired", { syncedHash: null });
      const fetchMock = routeFetch();

      startMemorySync(); // startup sweep
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(pushed(fetchMock)[0]?.map((n) => n.id)).toEqual(["mem_old"]);
    });

    it("finds a note edited since its last confirmed push", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_stale", "new content", { syncedHash: "an-older-hash" });
      const fetchMock = routeFetch();

      startMemorySync();
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(pushed(fetchMock)[0]?.map((n) => n.id)).toEqual(["mem_stale"]);
    });

    it("leaves an already-synced note alone", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const content = "already up there";
      seedNote("mem_clean", content, { syncedHash: sha256(content) });
      const fetchMock = routeFetch();

      startMemorySync();
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_SWEEP_MS + MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(pushed(fetchMock)).toEqual([]);
    });

    it("skips a note whose file no longer matches its row — the scan reconciles first", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const seeded = seedNote("mem_1", "as recorded");
      // An external edit the watcher has not caught up with yet. Pushing now
      // would ship content whose title/tags/updatedAt are stale.
      fs.writeFileSync(path.join(vault, seeded.relPath), "edited outside the app", "utf8");
      const fetchMock = routeFetch();

      startMemorySync();
      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_DEBOUNCE_MS * 2);

      expect(pushed(fetchMock)).toEqual([]);
    });
  });

  // ─── Pull ──────────────────────────────────────────────────────────────────

  describe("applyPulledNote", () => {
    it("writes to the cloud's own path and id — identity travels verbatim", () => {
      const note = remote();
      applyPulledNote(note);

      expect(fs.readFileSync(path.join(vault, "global/from-b.md"), "utf8")).toBe(note.content);
      const row = noteRow("mem_remote");
      expect(row?.id).toBe("mem_remote");
      expect(row?.path).toBe("global/from-b.md");
      // Not re-slugified into a new filename, which is what `writeNote()` would
      // have done and why the pull path must not call it.
      expect(row?.path).not.toMatch(/-[a-z0-9]{6}\.md$/);
    });

    it("marks a pulled note synced by definition — it came FROM the cloud", () => {
      const note = remote();
      applyPulledNote(note);
      const row = noteRow("mem_remote");
      expect(row?.synced_hash).toBe(note.contentHash);
      expect(row?.content_hash).toBe(note.contentHash);
    });

    it("hands the note to the local indexer rather than storing anything pre-computed", () => {
      applyPulledNote(remote());
      expect(enqueued.flat()).toEqual(["mem_remote"]);
      expect(noteRow("mem_remote")?.indexed_at).toBeNull();
    });

    it("is a no-op on an identical hash, even from a machine with a wildly wrong clock", () => {
      const note = remote();
      applyPulledNote(note);
      enqueued.length = 0;

      applyPulledNote({ ...note, updatedAt: "2030-01-01T00:00:00.000Z", title: "Renamed" });

      // Nothing rewritten, nothing re-indexed: hash equality short-circuits
      // before any clock is consulted.
      expect(enqueued).toEqual([]);
      expect(noteRow("mem_remote")?.title).toBe("From B");
    });

    it("overwrites a stale local copy when the remote is genuinely newer", () => {
      const seeded = seedNote("mem_1", "old local", {
        relPath: "global/shared.md",
        syncedHash: sha256("old local"),
        updatedAt: "2026-08-12T10:00:00.000Z",
      });
      applyPulledNote(
        remote({
          id: "mem_1",
          path: seeded.relPath,
          content: "newer remote",
          updatedAt: "2026-08-12T11:00:00.000Z",
        }),
      );

      expect(fs.readFileSync(path.join(vault, "global/shared.md"), "utf8")).toBe("newer remote");
      expect(enqueued.flat()).toContain("mem_1");
    });

    it("does NOT clobber an un-pushed local edit with an older-or-equal remote", () => {
      // contentHash != syncedHash: this machine has an edit still waiting to go
      // out. A pull that merely arrived faster must not win.
      seedNote("mem_1", "my unsent edit", {
        relPath: "global/shared.md",
        syncedHash: "the-hash-the-cloud-confirmed",
        updatedAt: "2026-08-12T12:00:00.000Z",
      });

      applyPulledNote(
        remote({
          id: "mem_1",
          path: "global/shared.md",
          content: "older remote",
          updatedAt: "2026-08-12T11:00:00.000Z",
        }),
      );

      expect(fs.readFileSync(path.join(vault, "global/shared.md"), "utf8")).toBe("my unsent edit");
      expect(enqueued).toEqual([]);
    });

    it("gives a tie to the un-pushed local edit rather than the arriving remote", () => {
      seedNote("mem_1", "my unsent edit", {
        relPath: "global/shared.md",
        syncedHash: "confirmed-earlier",
        updatedAt: "2026-08-12T12:00:00.000Z",
      });

      applyPulledNote(
        remote({
          id: "mem_1",
          path: "global/shared.md",
          content: "remote, same second",
          updatedAt: "2026-08-12T12:00:00.000Z",
        }),
      );

      expect(fs.readFileSync(path.join(vault, "global/shared.md"), "utf8")).toBe("my unsent edit");
    });

    it("refuses a payload whose hash does not match its own content", () => {
      // Every decision in this function assumes contentHash === sha256(content).
      // Storing a note where that is false would leave a row matching no file:
      // permanently dirty, pushed back forever.
      applyPulledNote(remote({ contentHash: "a-hash-of-something-else" }));

      expect(noteRow("mem_remote")).toBeUndefined();
      expect(fs.existsSync(path.join(vault, "global/from-b.md"))).toBe(false);
      expect(enqueued).toEqual([]);
    });

    it("refuses to overwrite when a DIFFERENT note already holds that vault path", () => {
      seedNote("mem_local", "mine", { relPath: "global/contested.md" });

      applyPulledNote(remote({ id: "mem_other", path: "global/contested.md", content: "theirs" }));

      expect(fs.readFileSync(path.join(vault, "global/contested.md"), "utf8")).toBe("mine");
      expect(noteRow("mem_other")).toBeUndefined();
    });

    it("is idempotent — replaying a page after a crash costs comparisons, not duplicates", () => {
      const note = remote();
      applyPulledNote(note);
      applyPulledNote(note);
      applyPulledNote(note);

      const count = getSqlite()
        .prepare("SELECT COUNT(*) AS n FROM memory_notes WHERE id = 'mem_remote'")
        .get() as { n: number };
      expect(count.n).toBe(1);
      expect(enqueued.flat()).toEqual(["mem_remote"]);
    });
  });

  describe("pullOnce", () => {
    it("starts from the epoch on a machine that has never pulled", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const fetchMock = routeFetch();
      startMemorySync();
      await vi.advanceTimersByTimeAsync(10);

      expect(pullUrls(fetchMock)[0]).toContain(encodeURIComponent("1970-01-01T00:00:00.000Z"));
    });

    it("pages until the server reports a short page, advancing the cursor as it goes", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      let call = 0;
      const fetchMock = routeFetch({
        "/memory/pull": () => {
          call++;
          if (call === 1) {
            return jsonResponse(200, {
              notes: [remote({ id: "mem_p1", path: "global/p1.md" })],
              nextCursor: { updatedAt: "2026-08-12T12:00:00.000Z", id: "mem_p1" },
            });
          }
          return jsonResponse(200, {
            notes: [remote({ id: "mem_p2", path: "global/p2.md" })],
            nextCursor: null,
          });
        },
      });

      startMemorySync();
      await vi.advanceTimersByTimeAsync(10);

      expect(call).toBe(2);
      expect(noteRow("mem_p1")).toBeDefined();
      expect(noteRow("mem_p2")).toBeDefined();
      // The second request resumed from the cursor the SERVER handed back.
      expect(pullUrls(fetchMock)[1]).toContain("mem_p1");
    });

    it("does not advance the cursor past a page whose writes have not landed", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      routeFetch({
        "/memory/pull": () => jsonResponse(500, {}),
      });

      startMemorySync();
      await vi.advanceTimersByTimeAsync(10);

      const cursor = getSqlite()
        .prepare("SELECT value FROM settings WHERE key = 'memory.pulledThroughUpdatedAt'")
        .get() as { value: string } | undefined;
      expect(cursor).toBeUndefined();
    });

    it("stops rather than looping when the server hands back a cursor that did not move", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      let call = 0;
      routeFetch({
        "/memory/pull": () => {
          call++;
          return jsonResponse(200, {
            notes: [],
            // The same cursor the daemon just sent — an infinite loop if trusted.
            nextCursor: { updatedAt: new Date(0).toISOString(), id: "" },
          });
        },
      });

      startMemorySync();
      await vi.advanceTimersByTimeAsync(10);

      expect(call).toBe(1);
    });

    it("re-pulls on the periodic sweep without needing a command", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      const fetchMock = routeFetch();
      startMemorySync();
      await vi.advanceTimersByTimeAsync(10);
      const afterStartup = pullUrls(fetchMock).length;

      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_SWEEP_MS + 10);

      expect(pullUrls(fetchMock).length).toBeGreaterThan(afterStartup);
    });

    it("does nothing when unpaired", async () => {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      await pullOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  describe("lifecycle", () => {
    it("unrefs both timers, so a paired daemon can still exit cleanly", () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      routeFetch();
      const unrefs: string[] = [];
      const realSetInterval = globalThis.setInterval;
      const realSetTimeout = globalThis.setTimeout;
      vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: never, ms: never) => {
        const t = realSetInterval(fn, ms);
        const original = t.unref?.bind(t);
        t.unref = () => {
          unrefs.push("interval");
          return original ? original() : t;
        };
        return t;
      }) as never);
      vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: never, ms: never) => {
        const t = realSetTimeout(fn, ms);
        const original = t.unref?.bind(t);
        t.unref = () => {
          unrefs.push("timeout");
          return original ? original() : t;
        };
        return t;
      }) as never);

      startMemorySync();
      seedNote("mem_1", "x");
      markNoteDirty("mem_1");

      expect(unrefs).toContain("interval");
      expect(unrefs).toContain("timeout");
    });

    it("stops cleanly and ignores writes afterwards", async () => {
      saveConnection({ token: "t", machineId: "mach-test", runtimes: [{ runtimeId: "rt", workspaceId: "ws" }] });
      seedNote("mem_1", "hello");
      const fetchMock = routeFetch();
      startMemorySync();
      stopMemorySync();

      markNoteDirty("mem_1");
      await vi.advanceTimersByTimeAsync(MEMORY_SYNC_SWEEP_MS * 2);

      expect(pushed(fetchMock)).toEqual([]);
    });
  });
});
