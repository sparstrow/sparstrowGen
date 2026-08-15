import { describe, expect, it } from "vitest";
import { MEMORY_PULL_PAGE_SIZE, MEMORY_PUSH_MAX_NOTES, type MemoryNoteSyncPayload } from "@sparstrow/shared";
import {
  EPOCH_CURSOR,
  cursorFilter,
  decidePush,
  nextCursorFrom,
  parsePullCursor,
  parsePullLimit,
  parsePushBatch,
  rowToPayload,
  toCloudRow,
} from "./memory-sync";

function note(over: Partial<MemoryNoteSyncPayload> = {}): MemoryNoteSyncPayload {
  return {
    id: "mem_abc1234567",
    path: "global/a-note-x1y2z3.md",
    scope: "global",
    projectSlug: null,
    agentSlug: null,
    title: "A note",
    tags: ["one"],
    source: "user",
    type: "note",
    content: "---\nid: mem_abc1234567\n---\n\nbody\n",
    quarantined: false,
    archivedAt: null,
    supersededBy: null,
    contentHash: "hash-a",
    createdAt: "2026-08-12T10:00:00.000Z",
    updatedAt: "2026-08-12T10:00:00.000Z",
    ...over,
  };
}

describe("parsePushBatch", () => {
  it("accepts a well-formed batch", () => {
    const parsed = parsePushBatch({ notes: [note()] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.notes[0].id).toBe("mem_abc1234567");
  });

  it("refuses a body that is not an object with notes", () => {
    for (const body of [null, [], "notes", { notes: {} }, {}]) {
      expect(parsePushBatch(body).ok).toBe(false);
    }
  });

  it("refuses an empty batch — a daemon sending them is looping", () => {
    expect(parsePushBatch({ notes: [] }).ok).toBe(false);
  });

  it("refuses a batch over the ceiling", () => {
    const notes = Array.from({ length: MEMORY_PUSH_MAX_NOTES + 1 }, (_, i) =>
      note({ id: `mem_${i}` }),
    );
    expect(parsePushBatch({ notes }).ok).toBe(false);
  });

  it("refuses the same id twice in one batch — the winner would be ordering luck", () => {
    const parsed = parsePushBatch({ notes: [note(), note({ contentHash: "hash-b" })] });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.detail).toContain("twice");
  });

  it("refuses a path that escapes the vault", () => {
    for (const path of ["../outside.md", "/etc/passwd", "global\\windows.md", "a/../../b.md"]) {
      const parsed = parsePushBatch({ notes: [note({ path })] });
      expect(parsed.ok, path).toBe(false);
    }
  });

  it("refuses an unknown scope", () => {
    expect(parsePushBatch({ notes: [note({ scope: "everywhere" as never })] }).ok).toBe(false);
  });

  it("refuses an unparseable updatedAt — it would lose every conflict silently", () => {
    expect(parsePushBatch({ notes: [note({ updatedAt: "whenever" })] }).ok).toBe(false);
  });

  it("refuses a missing contentHash — the hash-first short-circuit depends on it", () => {
    expect(parsePushBatch({ notes: [note({ contentHash: "" })] }).ok).toBe(false);
  });

  it("accepts empty content — a note whose body was cleared is still a note", () => {
    expect(parsePushBatch({ notes: [note({ content: "" })] }).ok).toBe(true);
  });

  it("drops non-string tags rather than failing the batch", () => {
    const parsed = parsePushBatch({ notes: [{ ...note(), tags: ["ok", 3, null] }] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.notes[0].tags).toEqual(["ok"]);
  });
});

describe("decidePush — last-write-wins, hash first and clock second", () => {
  it("inserts when the cloud has no row", () => {
    expect(decidePush(note(), null)).toBe("insert");
  });

  it("no-ops on an equal hash REGARDLESS of the clock — the skew-proof path", () => {
    // The incoming note's clock is a full day behind and it still wins, because
    // identical content means there is nothing to decide. This is decision 2's
    // whole point: the common case never reaches a timestamp comparison.
    const verdict = decidePush(note({ updatedAt: "2026-08-11T10:00:00.000Z" }), {
      contentHash: "hash-a",
      updatedAt: "2026-08-12T10:00:00.000Z",
    });
    expect(verdict).toBe("noop");
  });

  it("updates when content differs and the incoming note is newer", () => {
    const verdict = decidePush(note({ contentHash: "hash-b", updatedAt: "2026-08-12T11:00:00.000Z" }), {
      contentHash: "hash-a",
      updatedAt: "2026-08-12T10:00:00.000Z",
    });
    expect(verdict).toBe("update");
  });

  it("rejects when content differs and the incoming note is older", () => {
    const verdict = decidePush(note({ contentHash: "hash-b", updatedAt: "2026-08-12T09:00:00.000Z" }), {
      contentHash: "hash-a",
      updatedAt: "2026-08-12T10:00:00.000Z",
    });
    expect(verdict).toBe("reject");
  });

  it("gives a tie to the incumbent, so the outcome does not depend on request order", () => {
    const verdict = decidePush(note({ contentHash: "hash-b" }), {
      contentHash: "hash-a",
      updatedAt: "2026-08-12T10:00:00.000Z",
    });
    expect(verdict).toBe("reject");
  });

  it("rejects rather than overwrites when a stored timestamp is corrupt", () => {
    // NaN compares false against everything. Written the naive way this would
    // read as "incoming is newer" and hand every future push the win.
    const verdict = decidePush(note({ contentHash: "hash-b" }), {
      contentHash: "hash-a",
      updatedAt: "not-a-date",
    });
    expect(verdict).toBe("reject");
  });
});

describe("toCloudRow", () => {
  it("stamps workspace and writer from the caller, never the note", () => {
    const row = toCloudRow("ws_1", "rt_1", note());
    expect(row.workspace_id).toBe("ws_1");
    expect(row.last_writer_runtime_id).toBe("rt_1");
  });

  it("carries the id and path through unchanged — identity travels verbatim", () => {
    const row = toCloudRow("ws_1", "rt_1", note());
    expect(row.id).toBe("mem_abc1234567");
    expect(row.path).toBe("global/a-note-x1y2z3.md");
  });

  it("has no vector or embedding field of any kind", () => {
    const keys = Object.keys(toCloudRow("ws_1", "rt_1", note()));
    expect(keys.some((k) => /vec|embed/i.test(k))).toBe(false);
  });
});

describe("rowToPayload", () => {
  it("normalises Postgres timestamps to ISO so both sides compare the same kind of value", () => {
    const payload = rowToPayload({
      id: "mem_1",
      path: "global/n.md",
      scope: "global",
      content_hash: "h",
      created_at: "2026-08-12 10:00:00+00",
      updated_at: new Date("2026-08-12T11:00:00.000Z"),
      archived_at: null,
    });
    expect(payload.createdAt).toBe("2026-08-12T10:00:00.000Z");
    expect(payload.updatedAt).toBe("2026-08-12T11:00:00.000Z");
    expect(payload.archivedAt).toBeNull();
  });

  it("fills sane defaults for columns a row may carry as null", () => {
    const payload = rowToPayload({ id: "mem_1", path: "global/n.md", scope: "global" });
    expect(payload.title).toBe("");
    expect(payload.tags).toEqual([]);
    expect(payload.source).toBe("user");
    expect(payload.type).toBe("note");
    expect(payload.quarantined).toBe(false);
  });
});

describe("pull cursor", () => {
  it("defaults to the epoch on a first-ever pull", () => {
    expect(parsePullCursor(new URLSearchParams())).toEqual(EPOCH_CURSOR);
  });

  it("falls back to the epoch rather than trusting an unparseable since", () => {
    expect(parsePullCursor(new URLSearchParams("since=soon&sinceId=mem_1"))).toEqual(EPOCH_CURSOR);
  });

  it("reads a tuple cursor", () => {
    const cursor = parsePullCursor(
      new URLSearchParams("since=2026-08-12T10:00:00.000Z&sinceId=mem_9"),
    );
    expect(cursor).toEqual({ updatedAt: "2026-08-12T10:00:00.000Z", id: "mem_9" });
  });

  it("clamps the limit to the page size and never above it", () => {
    expect(parsePullLimit(new URLSearchParams())).toBe(MEMORY_PULL_PAGE_SIZE);
    expect(parsePullLimit(new URLSearchParams("limit=10"))).toBe(10);
    expect(parsePullLimit(new URLSearchParams("limit=99999"))).toBe(MEMORY_PULL_PAGE_SIZE);
    expect(parsePullLimit(new URLSearchParams("limit=0"))).toBe(MEMORY_PULL_PAGE_SIZE);
    expect(parsePullLimit(new URLSearchParams("limit=nope"))).toBe(MEMORY_PULL_PAGE_SIZE);
  });

  it("expands the tuple into the disjunction PostgREST understands, with values quoted", () => {
    const filter = cursorFilter({ updatedAt: "2026-08-12T10:00:00.000Z", id: "mem_9" });
    expect(filter).toBe(
      'updated_at.gt."2026-08-12T10:00:00.000Z",and(updated_at.eq."2026-08-12T10:00:00.000Z",id.gt."mem_9")',
    );
  });
});

describe("nextCursorFrom", () => {
  it("is null on a short page — the daemon's signal that it is caught up", () => {
    expect(nextCursorFrom([note()], 200)).toBeNull();
  });

  it("is the LAST returned row on a full page, not a computed guess", () => {
    const page = [note({ id: "mem_1" }), note({ id: "mem_2", updatedAt: "2026-08-12T12:00:00.000Z" })];
    expect(nextCursorFrom(page, 2)).toEqual({ updatedAt: "2026-08-12T12:00:00.000Z", id: "mem_2" });
  });

  it("yields a cursor on a page that exactly fills the limit — caught up is observed, not predicted", () => {
    expect(nextCursorFrom([note()], 1)).not.toBeNull();
  });

  it("is null on an empty page", () => {
    expect(nextCursorFrom([], 200)).toBeNull();
  });
});
