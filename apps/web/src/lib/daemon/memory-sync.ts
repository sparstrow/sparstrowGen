import {
  MEMORY_PULL_PAGE_SIZE,
  MEMORY_PUSH_MAX_NOTES,
  type MemoryNoteSyncPayload,
  type MemoryPullCursor,
} from "@sparstrow/shared";

/**
 * M6 — what a memory push means, separated from the route that performs it.
 *
 * Same split as `transcript.ts`: the judgement lives here, where a test can
 * reach it without mocking a query builder. The judgement in question is
 * last-write-wins, and it is worth stating plainly that this file is where a
 * user's note either survives or is overwritten.
 *
 * Note what is NOT read anywhere below: `workspaceId`, `runtimeId`. Both come
 * from the bearer token, in the route, and these functions taking only a note
 * payload is part of how that stays true — there is no field on any type here
 * through which a body-supplied scope could reach a query. See `auth.ts`.
 */

const SCOPES = new Set(["global", "project", "agent"]);

/** The epoch, for a daemon that has never pulled. Sorts before every real row. */
export const EPOCH_CURSOR: MemoryPullCursor = {
  updatedAt: new Date(0).toISOString(),
  id: "",
};

export type PushParse =
  | { ok: true; notes: MemoryNoteSyncPayload[] }
  | { ok: false; detail: string };

function reject(detail: string): PushParse {
  return { ok: false, detail };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Validate a push body.
 *
 * Whole-batch refusal, like the transcript route: a batch with one malformed
 * note is refused entirely rather than partially stored. The daemon reads a
 * per-note `applied` flag to decide what is synced, and storing the sane subset
 * while reporting on all of them would mark unsynced notes as synced — the
 * memory equivalent of the transcript hole `parseEventBatch` exists to prevent.
 *
 * This is distinct from LWW: a note that LOSES last-write-wins is a normal,
 * successful outcome reported per note. Only a MALFORMED note fails the batch.
 */
export function parsePushBatch(body: unknown): PushParse {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reject("Body must be an object with a `notes` array.");
  }

  const raw = (body as { notes?: unknown }).notes;
  if (!Array.isArray(raw)) return reject("`notes` must be an array.");
  if (raw.length === 0) {
    // A daemon sending empty pushes is looping; a 200 lets it loop unnoticed.
    return reject("`notes` must contain at least one note.");
  }
  if (raw.length > MEMORY_PUSH_MAX_NOTES) {
    return reject(
      `A push may carry at most ${MEMORY_PUSH_MAX_NOTES} notes; received ${raw.length}.`,
    );
  }

  const notes: MemoryNoteSyncPayload[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return reject(`notes[${i}] must be an object.`);
    }
    const n = item as Record<string, unknown>;

    const id = optionalString(n.id);
    if (!id) return reject(`notes[${i}].id must be a non-empty string.`);
    if (seen.has(id)) {
      // Two versions of one note in a single batch: whichever the loop applied
      // last would win, silently and arbitrarily. That is not LWW, it is
      // ordering luck, so refuse rather than pick.
      return reject(`notes[${i}].id ${id} appears twice in this batch.`);
    }
    seen.add(id);

    const path = optionalString(n.path);
    if (!path) return reject(`notes[${i}].path must be a non-empty string.`);
    // A path is a key in `uq_memory_notes_workspace_path` and becomes a
    // filesystem location on every machine that pulls it. Traversal is refused
    // here as well as in the daemon's own `toAbsPath`, because this route holds
    // the service role and a malformed path stored now is one every future
    // puller has to defend against individually.
    if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
      return reject(
        `notes[${i}].path must be a vault-relative path with forward slashes and no "..".`,
      );
    }

    if (!SCOPES.has(n.scope as string)) {
      return reject(`notes[${i}].scope must be global, project or agent.`);
    }

    const content = typeof n.content === "string" ? n.content : null;
    if (content === null) return reject(`notes[${i}].content must be a string.`);

    const contentHash = optionalString(n.contentHash);
    if (!contentHash) return reject(`notes[${i}].contentHash must be a non-empty string.`);

    const createdAt = optionalString(n.createdAt);
    const updatedAt = optionalString(n.updatedAt);
    if (!createdAt || Number.isNaN(Date.parse(createdAt))) {
      return reject(`notes[${i}].createdAt must be an ISO 8601 timestamp.`);
    }
    if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
      // `updatedAt` decides conflicts. An unparseable one would compare as NaN
      // against every candidate and lose every time, silently.
      return reject(`notes[${i}].updatedAt must be an ISO 8601 timestamp.`);
    }

    notes.push({
      id,
      path,
      scope: n.scope as MemoryNoteSyncPayload["scope"],
      projectSlug: optionalString(n.projectSlug),
      agentSlug: optionalString(n.agentSlug),
      title: typeof n.title === "string" ? n.title : "",
      tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === "string") : [],
      source: typeof n.source === "string" && n.source ? n.source : "user",
      type: typeof n.type === "string" && n.type ? n.type : "note",
      content,
      quarantined: n.quarantined === true,
      archivedAt: optionalString(n.archivedAt),
      supersededBy: optionalString(n.supersededBy),
      contentHash,
      createdAt,
      updatedAt,
    });
  }

  return { ok: true, notes };
}

/** What the cloud should do with one incoming note, given what it already has. */
export type PushVerdict = "insert" | "update" | "noop" | "reject";

/**
 * Last-write-wins, hash first and clock second.
 *
 * The ordering is the whole design. Hash equality is checked BEFORE any
 * timestamp comparison, so two machines holding identical content resolve as a
 * no-op no matter what either clock says — the common case, since notes are
 * append-mostly and one-topic-each, is therefore immune to clock skew entirely.
 *
 * Only genuinely divergent content reaches the clock, and that comparison is
 * the accepted risk M6 names rather than solves (doc/tasks/M6/README.md
 * decision 2): `updatedAt` is wall-clock time from two machines nothing
 * synchronises, so a badly-skewed clock can win a conflict it should lose. The
 * plan's instruction is explicit — do not build a CRDT — and a skew-proof merge
 * is most of the way to one.
 *
 * Ties lose. Equal timestamps with differing content means two machines wrote
 * in the same millisecond and there is no defensible winner; rejecting hands
 * the incumbent the tie, which at least makes the outcome stable rather than
 * dependent on which request the route happened to process first.
 */
export function decidePush(
  incoming: MemoryNoteSyncPayload,
  existing: { contentHash: string; updatedAt: string } | null,
): PushVerdict {
  if (!existing) return "insert";
  if (existing.contentHash === incoming.contentHash) return "noop";

  const incomingAt = Date.parse(incoming.updatedAt);
  const existingAt = Date.parse(existing.updatedAt);
  // A corrupt stored timestamp must not silently hand every future push the
  // win. `!(a > b)` rather than `a <= b` because every comparison with NaN is
  // false, and the naive form would read NaN as "incoming is newer".
  if (Number.isNaN(incomingAt) || Number.isNaN(existingAt)) return "reject";

  return incomingAt > existingAt ? "update" : "reject";
}

/**
 * Row for the upsert. `workspace_id` and `last_writer_runtime_id` are the
 * CALLER'S, resolved from the token — never the body's.
 *
 * `lastWriterRuntimeId` is not scope-security-critical (nothing reads it to
 * make a decision; the daemon is explicitly forbidden from filtering pulls on
 * it) but it is stamped from the token anyway, because a debugging field a
 * client can lie in is worse than no field at all.
 */
export function toCloudRow(
  workspaceId: string,
  runtimeId: string,
  note: MemoryNoteSyncPayload,
): Record<string, unknown> {
  return {
    id: note.id,
    workspace_id: workspaceId,
    path: note.path,
    scope: note.scope,
    project_slug: note.projectSlug,
    agent_slug: note.agentSlug,
    title: note.title,
    tags: note.tags,
    source: note.source,
    type: note.type,
    content: note.content,
    quarantined: note.quarantined,
    archived_at: note.archivedAt,
    superseded_by: note.supersededBy,
    content_hash: note.contentHash,
    last_writer_runtime_id: runtimeId,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

/** A stored row, back out as the wire shape. */
export function rowToPayload(row: Record<string, unknown>): MemoryNoteSyncPayload {
  return {
    id: row.id as string,
    path: row.path as string,
    scope: row.scope as MemoryNoteSyncPayload["scope"],
    projectSlug: (row.project_slug as string | null) ?? null,
    agentSlug: (row.agent_slug as string | null) ?? null,
    title: (row.title as string | null) ?? "",
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    source: (row.source as string | null) ?? "user",
    type: (row.type as string | null) ?? "note",
    content: (row.content as string | null) ?? "",
    quarantined: row.quarantined === true,
    archivedAt: toIso(row.archived_at),
    supersededBy: (row.superseded_by as string | null) ?? null,
    contentHash: (row.content_hash as string | null) ?? "",
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

/**
 * Postgres `timestamptz` comes back as a string whose exact format depends on
 * the driver. Normalised to ISO here so the daemon's `Date.parse` comparisons
 * and its own locally-stored ISO strings are the same kind of value.
 */
function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

/** Cursor from the query string, defaulting to the epoch on a first-ever pull. */
export function parsePullCursor(params: URLSearchParams): MemoryPullCursor {
  const since = params.get("since");
  const sinceId = params.get("sinceId");
  if (!since || Number.isNaN(Date.parse(since))) return EPOCH_CURSOR;
  return { updatedAt: new Date(Date.parse(since)).toISOString(), id: sinceId ?? "" };
}

/** Page size from the query string, clamped. A caller may ask for less, never more. */
export function parsePullLimit(params: URLSearchParams): number {
  const raw = Number(params.get("limit"));
  if (!Number.isFinite(raw) || raw < 1) return MEMORY_PULL_PAGE_SIZE;
  return Math.min(Math.floor(raw), MEMORY_PULL_PAGE_SIZE);
}

/**
 * `(updated_at, id) > (:updatedAt, :id)` as PostgREST understands it.
 *
 * PostgREST has no row-value comparison, so the tuple is expanded into the
 * disjunction it means: a strictly later timestamp, OR the same timestamp with
 * a later id. Written out rather than approximated with a bare `gt` on
 * `updated_at`, which would skip the second of two notes sharing a
 * millisecond, or with `gte`, which would re-serve the same row forever when a
 * page boundary landed exactly on it.
 *
 * Values are double-quoted: an ISO timestamp contains `:` and `.`, both of
 * which are structural in PostgREST filter syntax.
 */
export function cursorFilter(cursor: MemoryPullCursor): string {
  const at = JSON.stringify(cursor.updatedAt);
  const id = JSON.stringify(cursor.id);
  return `updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${id})`;
}

/**
 * Where the next page starts — the last row this page actually returned.
 *
 * `null` on a short page, which is the daemon's signal that it is caught up.
 * A full page always yields a cursor even if the next one turns out empty:
 * "caught up" must be observed, not predicted.
 */
export function nextCursorFrom(
  notes: MemoryNoteSyncPayload[],
  limit: number,
): MemoryPullCursor | null {
  if (notes.length < limit) return null;
  const last = notes[notes.length - 1];
  return last ? { updatedAt: last.updatedAt, id: last.id } : null;
}
