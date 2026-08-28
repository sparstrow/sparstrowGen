# CS5 — Foundational: attachment storage & delivery

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-chat-session-and-conversation-ux.md`](../../plans/2026-08-27-chat-session-and-conversation-ux.md) (CS5) |
| **Kind** | **foundational** — blocks CS6, demos to nobody |
| **Spec** | [`../../specs/2026-08-27-chat-session-and-conversation-ux.md`](../../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Depends on** | — |
| **Blocks** | CS6 |
| **Status** | in progress — T-CS5-01/02/03 done 2026-08-28, T-CS5-04 (verification) next |
| **Open questions** | none |

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS5-01 — private bucket + attachments table + RLS](T-CS5-01-storage-schema.md) | `[S]` | foundational — unblocks CS6 | — | done (2026-08-28) |
| [T-CS5-02 — upload flow](T-CS5-02-upload.md) | `[S]` | foundational — unblocks CS6 | T-CS5-01 | done (2026-08-28) |
| [T-CS5-03 — signed URL in the dispatch payload, daemon download, scoped Read](T-CS5-03-delivery.md) | `[S]` | foundational — unblocks CS6 | T-CS5-01, T-CS5-02 | done (2026-08-28) |
| [T-CS5-04 — verification](T-CS5-04-verification.md) | `[S]` | foundational | T-CS5-01–03 | not started |

All four are `[S]`: -02 needs -01's table/bucket to exist to write into, and
-03 needs a real attachment row (from -02) to build a signed URL for and a
real bucket (from -01) to sign against. This phase is a true pipeline, not a
set of independent pieces — no `[P]` opportunity here.

## Objective

Everything needed for an attachment to travel from the composer's upload,
through Postgres, onto a runtime's local disk, in a place the CLI providers'
existing file tools can reach — before CS6 builds the UI that produces one.

## The shape of what was found

- `013_storage_images.sql`'s own header is explicit and directly on point:
  *"**NEVER PUT ANYTHING ELSE IN THIS BUCKET.** Not an export, not an
  upload, not an attachment... If a future feature needs stored files, it
  needs its own bucket with its own read policy."* That bucket
  (`public-images`) is also **deliberately publicly readable** — exactly
  wrong for private conversation content. This phase's bucket is new,
  private, and read via short-lived signed URLs, never `getPublicUrl`.
- `chat_messages.content` is `text` NOT NULL (`packages/shared/src/db/schema.ts:865`)
  — attachments are a separate table referencing a message, not a field on
  it, so a message with zero, one, or several attachments doesn't need a
  schema shape change to `chat_messages` itself.
- `chat.turn`'s dispatch payload already carries the full message transcript
  inline specifically to avoid a second round trip
  (`016_chat_turn_transcript.sql`). Plan Decision 4 deliberately breaks that
  pattern for attachments: a signed URL, not bytes, travels in the payload —
  see that task for the reasoning.
- CLI providers receive a prompt string and a `cwd`, nothing else
  (`packages/core/src/providers/types.ts:56` — `buildHeadlessSpawn(agent,
  prompt, opts)`). There is no content-block or multimodal path anywhere in
  the CLI execution pipeline, and chat can never select a `DirectApiProvider`
  that has one (`assertCliProvider`) — plan Decision 5's approach (place the
  file on disk, tell the model its path) is not a workaround, it's the only
  mechanism this pipeline has.

## Definition of done

- An attachment uploaded through the composer (CS6) ends up, by the time a
  CLI spawn for that turn starts, as a real file on the runtime's local
  disk, at a path the turn's prompt names.
- For a `project` session, that path is inside the project's own `rootDir`.
  For `free`/`agent` sessions, it's inside that turn's own scratch `tempDir`,
  and the turn is granted a `Read` tool scoped to only that directory —
  **implemented for both `claude-code` and `antigravity`, but live-confirmed
  to actually work only if the underlying provider enforces it.**
  `antigravity` does not (T-CS5-03's own live test, filed as
  [`SEC-2026-08-28-antigravity-headless-tools-unrestricted`](../../security/SEC-2026-08-28-antigravity-headless-tools-unrestricted.md));
  `claude-code`'s side is unconfirmed, not proven safe
  ([`KnownGaps.md` G-51](../../KnownGaps.md)).
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** any composer UI (CS6). Any real multimodal/inline
content-block path for a `DirectApiProvider` (plan Scope boundaries — chat
can't reach one).

---

## Decisions already made

Plan decisions 4 and 5 are inherited in full; this phase is their
implementation. Restated only where a task needs the exact mechanism:

### 1. One new, private bucket: `chat-attachments`

Not `public-images` (see "What was found"). Path shape:
`<workspace_id>/<session_id>/<uuid>.<original-extension>` — mirrors the
existing `avatars/<user_id>/…` prefix-scoped-policy pattern, but scoped to
workspace + session rather than user, matching who is actually authorized to
read a chat session's own content.

### 2. Size/type limits follow the avatar-upload precedent until a task finds a reason to diverge

`T-M9-04`'s 2 MB ceiling and MIME allowlist is the starting point (plan
Scope boundaries) — a real reason to raise it (a legitimate file type that
routinely exceeds 2 MB, e.g. a PDF) is a task-level decision to record, not
an assumption to carry silently.

## Files

| Path | Change |
|---|---|
| `packages/shared/drizzle/policies/025_chat_attachments_storage.sql` | done: `chat-attachments` bucket, its RLS, `chat_message_attachments` table + RLS |
| `packages/shared/src/db/schema.ts` | done: `chatMessageAttachments` table |
| `packages/shared/src/constants.ts` | done: `CHAT_ATTACHMENT_BUCKET`, allowed types/size (widened past the avatar floor — see T-CS5-01), alongside the existing `PUBLIC_IMAGE_*` constants |
| `apps/web/src/lib/storage/attachment-uploader.ts` | done: generalizes `image-uploader.ts`'s shape for arbitrary files against the new private bucket |
| `packages/shared/drizzle/policies/026_chat_attachments_dispatch.sql` | done: `enqueue_chat_turn` gains `p_attachments` and creates the attachment rows atomically, BEFORE dispatch (correcting T-CS5-02's own post-hoc insert — see T-CS5-03's Result); `assign_or_park_chat_turn` embeds `{storagePath, filename}` per attachment in the payload — deliberately no signed URL, see next row |
| `apps/web/src/app/api/daemon/chat/attachments/sign/route.ts` | new (not in the original plan): mints a short-lived signed URL on demand, right before the daemon downloads — a parked-then-rescanned turn can outlive any TTL baked into the payload at dispatch time |
| `packages/core/src/cloud/chat-turn.ts` | done: downloads attachment(s) to disk before building the prompt; grants scoped `Read` + a fresh tempDir for `free`/`agent` turns (and a `project` session with no `rootDir`) |

## Traps

- **A public bucket or a `getPublicUrl` call anywhere in this phase is a
  data leak, not a convenience.** Chat content is exactly the kind of thing
  `013_storage_images.sql`'s header warns against putting in a public
  bucket. Every read path here must go through a signed URL, scoped and
  short-lived.
- **The daemon downloading a large attachment must not block the turn
  indefinitely** — apply a reasonable timeout to the download step, and fail
  the turn legibly (same `classifyTurnError` shape chat already uses) rather
  than hanging past `TURN_TIMEOUT_MS`. Done: a 30s download timeout, worded
  so `classifyTurnError` reads it as `"timeout"`.
- **A `free`/`agent` turn's scoped `Read` grant must not persist past the
  turn.** No `EffectiveTools`-style shared mechanism was reused — the
  override lives entirely in a local variable inside one
  `executeChatTurn()` call and a fresh per-turn tempDir, with nothing
  written back to the session or agent row. **Found while satisfying this
  exact Trap: the grant itself does not currently restrict anything for
  `antigravity`** — see
  [`SEC-2026-08-28-antigravity-headless-tools-unrestricted`](../../security/SEC-2026-08-28-antigravity-headless-tools-unrestricted.md).

## Verification

Full procedure in [T-CS5-04 — verification](T-CS5-04-verification.md).
