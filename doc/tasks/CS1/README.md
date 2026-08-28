# CS1 — Rename & delete a chat session

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-chat-session-and-conversation-ux.md`](../../plans/2026-08-27-chat-session-and-conversation-ux.md) (CS1) |
| **Kind** | **serves US1** — ends in something the owner can use |
| **Spec** | [`../../specs/2026-08-27-chat-session-and-conversation-ux.md`](../../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Depends on** | — |
| **Blocks** | nothing |
| **Status** | not started |
| **Open questions** | none |

## The story this serves

> **US1 — Rename and delete a chat session, deliberately** (spec)
>
> The owner has a growing list of chat sessions and wants to relabel one or
> get rid of one they no longer want. They reach a per-session action — from
> the rail row or the conversation header — that lets them rename it, or
> choose to remove it entirely with a confirmation that spells out the
> difference between archiving and deleting.

**Acceptance scenarios this phase must satisfy:**

1. **Given** a session titled "New conversation", **When** the owner renames
   it, **Then** the rail and header both show the new title immediately, and
   it survives a reload.
2. **Given** a session the owner wants gone, **When** they choose to remove
   it, **Then** a confirmation offers **Archive**, **Delete**, and
   **Cancel**, stating Delete is permanent and removes the message history.
3. **Given** that confirmation is open, **When** the owner picks **Delete**,
   **Then** the session and its messages are gone entirely, including after
   a reload.
4. **Given** that confirmation is open, **When** the owner picks
   **Archive**, **Then** it leaves the active list the same way today's
   Archive icon already behaves, but is not destroyed.
5. **Given** that confirmation is open, **When** the owner picks **Cancel**,
   **Then** nothing changes.
6. **Given** the owner clears the title entirely while renaming, **When**
   they try to save, **Then** the session keeps a usable name rather than
   being left blank.

**Independent test:** Rename an existing session and confirm the new title
survives a reload. Separately, delete a different session through the
confirmation flow and confirm it's gone for good; confirm Cancel and Archive
each leave it in the expected, non-destroyed state.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Per-session menu (rail row / header) | Rename and Delete entries, both enabled | n/a — always has both entries | n/a — opens instantly, no async fetch | n/a |
| Rename (inline title edit) | Shows the current title, editable | n/a | n/a — client-side only until save | Save fails (network/RLS): input stays editable, a message names the failure, title is not silently reverted |
| Removal confirmation dialog | Archive / Delete / Cancel, with the permanence wording on Delete | n/a | While the delete/archive request is in flight: buttons disabled, no double-submit | The request fails: dialog stays open, states what went wrong, offers retry — never closes silently |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS1-01 — per-session menu, with rename](T-CS1-01-menu-and-rename.md) | `[S]` | US1 | — | not started |
| [T-CS1-02 — delete, with the Archive/Delete/Cancel confirmation](T-CS1-02-delete-confirmation.md) | `[S]` | US1 | T-CS1-01 | not started |
| [T-CS1-03 — verification](T-CS1-03-verification.md) | `[S]` | US1 | T-CS1-01, T-CS1-02 | not started |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

Give the owner a per-session menu (reachable from the rail row and the
conversation header) with two entries: **Rename** (inline edit of the
existing `title` field) and **Delete** (a confirmation offering Archive,
Delete, or Cancel, wired to a new hard-delete action). No schema or RLS
change is needed — see below.

## The shape of what was found

- `chatSessionUpdateSchema` (`packages/shared/src/schemas/chat.ts:76`)
  already accepts an optional `title`, and `updateChatSessionAction`
  (`apps/web/src/app/chat/actions.ts`) already wires it through to
  `PATCH`-equivalent behavior on `chat_sessions` — confirmed working per
  [`BUG-2026-08-26-chat-session-updates-always-404`](../../bug/BUG-2026-08-26-chat-session-updates-always-404.md).
  **Rename needs no new backend capability**, only a UI entry point that
  calls the existing action.
- `chat_sessions` and `chat_messages` both sit under the generic
  workspace-member RLS policy (`packages/shared/drizzle/policies/001_rls.sql:104`,
  `for all` — every verb including `DELETE`). `chat_messages.session_id` and
  `chat_turns.session_id` are both `references(chatSessions.id, {
  onDelete: "cascade" })` (`packages/shared/src/db/schema.ts:863`, `:911`).
  **A plain `DELETE` on `chat_sessions` for a row the caller's workspace owns
  is already authorized and already cascades correctly.** No migration, no
  policy change.
- The only existing per-session control anywhere in the UI is the Archive
  icon in the conversation header (`apps/web/src/app/chat/chat.tsx`, calls
  `updateChatSessionAction({ status: "archived" })`). There is no rename or
  delete control, and no per-row menu on the rail at all — confirmed via
  [`FB-2026-08-27-chat-no-manual-rename-delete`](../../feedback/FB-2026-08-27-chat-no-manual-rename-delete.md).
- [`I-13`](../../Ideas.md) (parked 2026-08-24) already scoped a chat
  right-click menu and flagged the same "is delete real?" question this
  phase answers: **real, permanent delete** — confirmed with the owner
  2026-08-27 (see the spec's Trigger). Fork, pin, "Continue on `<machine>`",
  and the `/shortcuts` page from that idea are explicitly **not** part of
  this phase — they stay parked in `I-13`.

## Definition of done

- US1 acceptance scenarios 1–6, walked end to end in the running app.
- All three states on the per-session menu, rename input, and confirmation
  dialog (populated / loading / error — no meaningful empty state on any of
  these three, since a menu without a session doesn't render at all).
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** Fork, session pinning, "Continue on `<machine>`", the
`/shortcuts` page (all `I-13`, parked). Unarchiving a session (no unarchive
affordance exists anywhere today, including before this phase — out of
scope per the spec, which only asks for rename and delete).

---

## Decisions already made

### 1. Delete is a direct RLS-scoped query, not a new RPC

Plan decision 6: unlike `enqueue_chat_turn`/`retry_chat_turn`, delete needs
no multi-table transaction or elevated privilege — `.from("chat_sessions").delete().eq("id",
id)` under the caller's own session is sufficient and RLS already scopes it.

### 2. The confirmation's wording is about the conversation, not the memory-notes system

Per the spec's Assumptions: the owner's own phrase ("warn that the memory
associated with chat will also be deleted") refers to that session's message
history, not the separate project/agent memory-notes feature — chat turns
don't feed that system at all yet ([`D-20`](../../Deferred.md)). The
confirmation copy should say the conversation/message history is what's
lost, in the owner's terms, not reference "memory" as a system name.

### 3. One menu component, two entry points

Both the rail row and the conversation header need the same Rename/Delete
menu. Build it once (e.g. a `ChatSessionMenu` component taking the session
id/title) and mount it from both places, rather than two separate
implementations that can drift.

## Files

| Path | Change |
|---|---|
| `apps/web/src/app/chat/actions.ts` | new: `deleteChatSessionAction` |
| `apps/web/src/app/chat/chat.tsx` | edit: mount the new menu on rail rows and in the header; wire rename to the existing update action; wire delete to the new confirmation |
| new component (e.g. `apps/web/src/app/chat/chat-session-menu.tsx`) | new: the per-session menu + inline rename + confirmation dialog |

## Traps

- **Renaming the currently-open session must update the header too, not just
  the rail row.** They read the same session object today; verify a rename
  doesn't leave one stale if the component tree caches it in two places.
- **Deleting the currently-open session must navigate away cleanly.** If the
  owner deletes the session they're looking at, the conversation pane can't
  keep pointing at a now-nonexistent id — confirmed as an edge case in the
  spec, not just a nice-to-have.
- **The confirmation dialog must not double-submit.** Disable its buttons
  while the request is in flight (same pattern as the existing Archive
  button, which already guards against this).
- **A cleared-then-saved rename must not persist an empty string.** The
  schema allows `title: z.string().max(120).optional()` with no minimum
  length — the UI, not the schema, is what has to refuse an empty save (US1
  scenario 6).

## Verification

Full procedure in [T-CS1-03 — verification](T-CS1-03-verification.md).
