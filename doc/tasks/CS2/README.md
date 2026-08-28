# CS2 — Sessions name themselves

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-chat-session-and-conversation-ux.md`](../../plans/2026-08-27-chat-session-and-conversation-ux.md) (CS2) |
| **Kind** | **serves US2** — ends in something the owner can use |
| **Spec** | [`../../specs/2026-08-27-chat-session-and-conversation-ux.md`](../../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Depends on** | — |
| **Blocks** | nothing |
| **Status** | ✅ done 2026-08-28 |
| **Open questions** | none |

## The story this serves

> **US2 — New sessions name themselves from what you ask** (spec)
>
> The owner starts a brand-new chat and sends their first message. Instead
> of staying "New conversation" forever, the session's title updates to
> reflect what was actually asked.

**Acceptance scenarios this phase must satisfy:**

1. **Given** a brand-new session still titled "New conversation", **When**
   the owner sends their first message, **Then** the title updates to
   reflect that message shortly after.
2. **Given** a session the owner has already renamed by hand (CS1), **When**
   more messages are sent, **Then** the manual title is never overwritten.
3. **Given** the first message is very long or has no clear topic (e.g.
   "hi"), **When** the title is generated, **Then** it stays short and
   readable rather than dumping the raw message in as-is.

**Independent test:** Start a new session, send a first message, and confirm
the rail title changes from "New conversation" with no manual action taken.

## The four states

Not applicable — this phase changes a backend insert path, not a new UI
surface. The existing title display (already exercised by CS1) is the only
affected UI, and it already handles all four states for whatever string
`title` holds.

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS2-01 — auto-title on first message](T-CS2-01-auto-title.md) | `[S]` | US2 | — | done (2026-08-28) |
| [T-CS2-02 — verification](T-CS2-02-verification.md) | `[S]` | US2 | T-CS2-01 | ✅ done (2026-08-28) |

## Objective

Port the auto-naming logic the LOCAL chat path already has into the CLOUD
dispatch path the browser actually uses, so a session's title updates from
its first message without any manual step.

## The shape of what was found

`packages/core/src/chat/service.ts`'s `postChatTurn` (lines 463–467) already
does this for the local, SQLite-backed chat path:

```ts
insertMessage(sessionId, "user", content, null);
if (!session.title) {
  const title = content.trim().slice(0, 60);
  getDb().update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId)).run();
}
```

The browser's `/chat` talks to the cloud path instead —
`enqueue_chat_turn` (`packages/shared/drizzle/policies/014_chat_turn_dispatch.sql`),
the Postgres function `apps/web/src/app/chat/actions.ts`'s
`postChatTurnAction` RPCs into. It has no equivalent line. This is a small,
proven port, not new design — the only change from the local version is
trimming at a word boundary with an ellipsis (US2 scenario 3) instead of a
hard 60-character cut, since the spec explicitly asks for "short and
readable," not "exactly 60 characters."

## Definition of done

- US2 acceptance scenarios 1–3, walked end to end.
- `pnpm typecheck` and `pnpm test` stay green (including the SQL migration's
  own verify block, per this repo's migration convention).

**Not in this phase:** an AI-generated/summarized title. The spec asks for
"short and readable," which a word-boundary truncation already satisfies
without a second model call in the critical path of every first message —
see plan Decision context ("What the spec asks for that isn't obvious").

---

## Decisions already made

### 1. Truncate at a word boundary, not mid-word

`content.trim()`, then take up to ~60 characters, backing off to the last
space before that limit if the cut would otherwise land mid-word, appending
`…` when truncated. No new dependency, no AI call.

### 2. Never overwrite a manually-set title

Same guard the local path already uses — `if (!session.title)` — is
sufficient, since CS1's rename always sets a non-empty `title`. The only
risk is a race between a rename and a first message landing at nearly the
same moment; see Traps.

## Files

| Path | Change |
|---|---|
| `packages/shared/drizzle/policies/0NN_chat_session_auto_title.sql` | new migration: title-on-first-message logic added to the function `enqueue_chat_turn` (or a trigger on `chat_messages` insert — task decides after reading the function's current shape) |

## Traps

- **Race between a manual rename and the first message.** If the owner
  renames a session in the same instant the first message is being
  inserted, whichever write lands last wins. Given both go through Postgres
  under normal transactional semantics and this is a cosmetic field, accept
  last-write-wins rather than adding locking for a scenario with no
  meaningful harm either way — but note it here so it isn't "discovered" as
  a bug later.
- **`enqueue_chat_turn` inserts the user message and creates the `chat_turns`
  row in the same call** (per `apps/web/src/app/chat/actions.ts`'s own
  comment on `postChatTurnAction`). The title update must happen in the same
  function/transaction, checking `session.title = ''` (the column's own
  default, per `chatSessions.title.notNull().default("")` in
  `packages/shared/src/db/schema.ts:836`) — not a separate round trip that
  could race the insert.

## Verification

Full procedure in [T-CS2-02 — verification](T-CS2-02-verification.md).
