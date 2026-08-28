# Chat Session & Conversation UX — 2026-08-27

| | |
|---|---|
| **Spec** | [`doc/specs/2026-08-27-chat-session-and-conversation-ux.md`](../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Status** | In progress — CS1, CS2, CS3 done 2026-08-28; CS4 unblocked, CS5 next (parallel) |
| **Trigger** | Owner approved the spec 2026-08-27 and authorized planning, tasking, and implementation in the same turn, asking to stop only for decisions. |
| **Depends on** | — (chat's cloud dispatch path, M12–M15, is already shipped and is what this plan extends) |
| **Touches** | `apps/web/src/app/chat/`, `apps/web/src/lib/api/handlers/chat.ts`, `packages/core/src/chat/service.ts`, `packages/core/src/providers/antigravity.ts`, `packages/core/src/providers/types.ts`, `packages/shared/src/schemas/chat.ts`, `packages/shared/src/db/schema.ts`, `packages/shared/drizzle/policies/` |
| **Tasks** | [`doc/tasks/CS1/`](../tasks/CS1/README.md) … [`doc/tasks/CS6/`](../tasks/CS6/README.md) — decomposed 2026-08-28, Band 26 |
| **Open questions** | none |

## Summary

Serves all four stories in the spec above. US1 (rename/delete) and US2
(auto-naming) are thin — the backend they need either already exists or is a
few-line port of logic the local (SQLite) chat path already has. US3
(dynamic models) and US4 (attachments) each need one small piece of new
foundational plumbing — a live-discovery command for the `antigravity` CLI
provider, and a storage + delivery pipeline for message attachments —
because chat's cloud dispatch (M12) never had either capability to reuse.

## What the spec asks for that isn't obvious

**Auto-naming already exists — in the wrong chat implementation.**
`packages/core/src/chat/service.ts`'s `postChatTurn` (the LOCAL, SQLite-backed
chat path used by the Electron desktop shell) already does exactly what US2
asks for:

```ts
if (!session.title) {
  const title = content.trim().slice(0, 60);
  getDb().update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId)).run();
}
```

The owner's `/chat` in the browser talks to the *cloud* dispatch path instead
(`enqueue_chat_turn`, Postgres — M12), which has no equivalent line at all.
This is a port of four lines' worth of proven logic into the other
implementation, not new design.

**Chat is CLI-providers-only — which simplifies, not complicates, US3 and
US4.** `assertCliProvider` (both `packages/core/src/chat/service.ts` and
`apps/web/src/app/chat/actions.ts`) rejects any provider that isn't
`claude-code` or `antigravity`; direct-API providers (`anthropic-api`,
`ollama`) — which already have a working `discoverModels()` and a `ChatBlock`
content-type system — are **not reachable from chat at all**. Two
consequences:

- US3 only needs live discovery for `antigravity`. `claude-code`'s model list
  (`opus`/`sonnet`/`haiku`) is a set of stable tier aliases, not dated
  snapshots, so it doesn't drift the way `antigravity`'s does — it stays
  static, which is FR-006's clarification resolved, not left open.
  `antigravity`'s own static list carries a comment
  (`packages/shared/src/constants.ts:23`) confirming it was hand-copied from
  `agy models` output at CLI v1.1.0 — that command is the live-discovery
  mechanism to wire up, the same shape as `HeadlessSpawnOptions`/`SpawnSpec`
  already spawn CLIs for everything else.
- US4 needs exactly one delivery mechanism — write the file somewhere the
  CLI's own file tools can reach, then tell the model its path in the prompt
  — not two (a second, richer inline-content-block path for a direct-API
  provider that chat can never actually select). This is a real scope
  reduction from the options discussed with the owner when approving US4:
  the "direct-API sessions additionally get true inline images" half of that
  discussion doesn't apply to chat as it's actually built, so it's dropped
  here rather than built for a path nothing can reach.

**Deleting a session needs no new authorization.** `chat_sessions` and
`chat_messages` both sit under the generic workspace-member RLS policy
(`packages/shared/drizzle/policies/001_rls.sql:104`, `for all` — every verb,
including `DELETE`), and both `chat_messages.session_id` and
`chat_turns.session_id` are `references(chatSessions.id, { onDelete:
"cascade" })`. A `DELETE` on `chat_sessions` for a row the caller's workspace
owns already cascades correctly and is already permitted. This story is a
UI + one server action, not a schema or policy change.

## Work breakdown

### Foundational — blocks stories

| Work | Why no story owns it |
|---|---|
| `antigravity` live model discovery (spawn `agy models`, parse, degrade to the static list) | A CLI capability, not a screen — the owner sees its *result* only once the picker (US3) reads from it |
| A cloud dispatch path for "ask an online runtime to run a capability and report back" generalized enough to carry a discovery result | Infrastructure — extends the existing `chat.turn` command/result plumbing to a second command kind |
| Attachment storage (bucket + `chat_message_attachments` table + RLS) and the daemon-side download-and-place-on-disk step | The owner sees an attached file (US4); getting the bytes from Supabase Storage onto the runtime's disk before the CLI ever runs is invisible plumbing |

### Per story

| Story | Work | Delivers |
|---|---|---|
| US1 — rename & delete | Per-session menu (rail + header), inline rename (existing `title` field), a `deleteChatSessionAction` server action, the Archive/Delete/Cancel confirmation dialog | The owner can relabel or permanently remove any session |
| US2 — auto-naming | Port the 4-line truncate-on-first-message logic from `postChatTurn` into `enqueue_chat_turn` | Every new session gets a real name within moments, with no manual step |
| US3 — dynamic models | Composer picker reads a cached discovery result for `antigravity`, refreshing it when stale; `claude-code` keeps its static list | The model list for `antigravity` matches what `agy models` currently reports |
| US4 — attachments | Composer drag-and-drop/upload UI, attachment shown on the draft and in sent messages, the CLI prompt told where to find the file | The owner can hand the agent a file and get a reply that actually used it |

## Decisions

### 1. A new `providers.discover_models` runtime-command kind, not a bolt-on to `chat.turn`

Modeled directly on `chat.turn` (`014_chat_turn_dispatch.sql`,
`016_chat_turn_transcript.sql`): a small Postgres function inserts a
`runtime_commands` row of kind `providers.discover_models` targeting an
online runtime capable of `antigravity`; the daemon's existing command-poll
loop picks it up, spawns `agy models`, and posts the result back the same
way a chat turn posts its reply. Rejected: piggybacking discovery onto the
next `chat.turn` a session happens to send — that couples an unrelated
concern to message dispatch and only refreshes when the owner happens to be
mid-conversation, which is backwards for a picker they open *before* typing
anything.

### 2. Discovery results are cached workspace-wide, not per-session

One `provider_model_cache` row per `(workspace_id, provider)`, refreshed
on-demand when a picker opens and the cached row is missing or older than 1
hour (matches the "stale but usable" behavior US3.3 asks for), never
refreshed proactively. Rejected: a background poll on a fixed interval —
there is no owner watching the picker between opens, so refreshing it before
anyone looks is pure cost for a value nobody reads yet.

### 3. `antigravity`'s CLI provider gets a new optional `discoverModels()`, not a change to the shared `CliProvider` interface's required surface

`CliProvider` gains one optional method (`discoverModels?(): Promise<{
models: string[]; live: boolean; detail: string | null }>`). `claude-code`
does not implement it and keeps returning its static list via `listModels()`
alone — per Decision `#[What the spec asks for]`'s finding, that's correct
behavior, not a gap. Making it optional avoids forcing a no-op onto every
CLI provider that has no live source to query.

### 4. Attachments travel as a Storage reference in the command payload, not inline bytes

`chat.turn`'s payload already carries the full message transcript inline
specifically to avoid a second network round trip
(`016_chat_turn_transcript.sql`'s header comment). Attachments break that
pattern deliberately: a signed, short-lived Supabase Storage download URL
goes in the payload instead of the file's bytes. Putting binary content in a
`jsonb` column is the wrong tool regardless of round-trip cost — Postgres
`runtime_commands` rows are meant to stay small and queryable, and a
multi-megabyte payload would sit in every replica and backup of that table
indefinitely. The daemon fetches the URL directly (it already makes outbound
HTTPS calls to Supabase on every poll) and writes the bytes to local disk
before the turn's CLI spawn starts.

### 5. An attachment is placed on disk and named in the prompt; nothing new is granted to `claude-code`/`antigravity` beyond a scoped Read

For a `project` session, the file is written into that project's own
`rootDir` (a fresh, collision-avoided filename); the CLI's existing
`Read`/`Grep`/`Glob` tools already reach it. For `free`/`agent` sessions
(`cwd: null` — no repo to write into), the file goes into that turn's own
`HeadlessSpawnOptions.tempDir`, and the turn is granted a `Read` tool scoped
to only that directory (`effectiveTools`-style clamp, the same mechanism
`EffectiveTools` already uses elsewhere) — not a blanket new capability, and
not persisted past the turn. The prompt text built for the turn names the
file's path and that it was just attached. Rejected: extending `ChatBlock`
with an image type and wiring real multimodal input — that machinery exists
for `DirectApiProvider` but chat can never select one (see "What the spec
asks for"), so building it here would serve a path nothing reaches.

### 6. Delete is a hard delete via a direct RLS-scoped query, not a Postgres RPC

Every other chat-session mutation in `apps/web/src/app/chat/actions.ts` goes
through a small RPC (`enqueue_chat_turn`, `retry_chat_turn`, …) because those
need transactional multi-table writes or `SECURITY DEFINER` privilege this
one doesn't: `.from("chat_sessions").delete().eq("id", id)` under the
caller's own session is sufficient, RLS already scopes it to the caller's
workspace, and the FK cascades handle `chat_messages`/`chat_turns` without
any application code touching them.

## Phases

### CS1 — Rename & delete a chat session (serves US1)

Per-session menu on the rail row and in the conversation header; inline
rename against the existing `title` field; a new `deleteChatSessionAction`;
the Archive/Delete/Cancel confirmation dialog with the owner's specified
wording (conversation history is what's lost, not the separate memory-notes
system — spec Assumptions). No dependency on any other phase; can start
immediately.

### CS2 — Sessions name themselves (serves US2)

Port `postChatTurn`'s truncate-on-first-message logic into `enqueue_chat_turn`
(or the message-insert step it performs), respecting a manually-set title
(never overwrite one — US2.2) and truncating at a word boundary with an
ellipsis rather than a hard 60-char cut. No dependency on any other phase;
can run in parallel with CS1 (near-disjoint files).

### CS3 — Foundational: live model discovery for `antigravity`

`agy models` spawn + parse in `antigravity.ts`, the new
`providers.discover_models` command kind end to end (Postgres dispatch
function, daemon executor, result posting), and the `provider_model_cache`
table + its RLS. Blocks CS4. No dependency on any other phase; can run in
parallel with CS1/CS2.

### CS4 — Dynamic model picker (serves US3)

Composer's provider/model dropdown reads `provider_model_cache` for
`antigravity` (triggering a refresh dispatch when stale/missing) and keeps
reading `KNOWN_MODELS["claude-code"]` statically. Implements the
loading/stale/error states from the spec. Depends on CS3.

### CS5 — Foundational: attachment storage & delivery

Storage bucket + `chat_message_attachments` table + RLS; upload flow reusing
the existing `ImageUploadField`/`useImageUploader` pattern generalized to
arbitrary files; the signed-URL-in-payload mechanism (Decision 4); the
daemon-side download-to-disk step; the scoped-Read-tool grant for
`free`/`agent` turns (Decision 5). Blocks CS6. No dependency on any other
phase; can run in parallel with CS1–CS4.

### CS6 — Composer attachments, and the cross-story pass (serves US4)

Drag-and-drop/upload UI in the composer; attachment shown on the draft
(removable) and on sent messages (persisted); rejection messaging for
unsupported type/size. Depends on CS5. As the last phase to land, its
verification task also walks US1–US3 together in the same session to catch
any seam the individual phases' own verification missed (chat.tsx is a
shared file across all four stories).

## Scope boundaries

- Fork, session pinning, a "Continue on \<machine\>" override, and an
  app-wide `/shortcuts` page stay out of scope — parked in
  [`I-13`](../Ideas.md), per the spec's Assumptions.
- Team/manager chat is out of scope, same boundary as
  [`2026-08-23-chat-message-sending`](2026-08-23-chat-message-sending.md).
- Direct-API providers gaining a richer, inline-multimodal attachment path
  (real image content blocks via `ChatBlock`) is explicitly not built here —
  chat cannot select a direct-API provider at all (`assertCliProvider`). If
  that restriction is ever lifted, richer attachments for that path are a
  new idea, not a residue of this plan.
- Attachment type/size limits are decided at task-decomposition time
  (CS5), following the existing 2 MB avatar-upload ceiling
  (`T-M9-04`) as precedent rather than inventing a new number without one.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| SC-001 (no session stays "New conversation") | CS2's verification: send a first message in a fresh session, confirm the rail title updates within moments |
| SC-002 (delete requires explicit, worded confirmation) | CS1's verification: walk US1's five confirmation-outcome scenarios (rename, delete, archive, cancel, blank-title fallback) |
| SC-003 (model picker matches provider reality) | CS4's verification: compare the picker's `antigravity` list against a live `agy models` run on the verifying machine |
| SC-004 (attachment survives a reopen) | CS6's verification: attach a file, send, reopen the session, confirm it's still there; separately confirm the agent's reply reflects the file's actual contents (US4's independent test) |

## Result

<!-- Filled in as phases land. -->
