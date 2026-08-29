# T-CS1-01 — per-session menu, with rename

| | |
|---|---|
| **Tag** | `[S]` — authors the `ChatSessionMenu` component T-CS1-02 adds a Delete entry to |
| **Serves** | `US1` — rename half of "rename and delete a chat session, deliberately" |
| **Depends on** | — |
| **Blocks** | T-CS1-02 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## The scenario this satisfies

1. **Given** a session titled "New conversation", **When** the owner renames
   it, **Then** the rail and header both show the new title immediately, and
   it survives a reload.
6. **Given** the owner clears the title entirely while renaming, **When**
   they try to save, **Then** the session keeps a usable name rather than
   being left blank.

## Objective

Add a per-session menu, reachable from the rail row and the conversation
header, with a working **Rename** entry (inline title edit) wired to the
existing `updateChatSessionAction`. The menu's shell also carries the (not
yet wired) **Delete** entry so T-CS1-02 has a mount point rather than
building the menu twice.

## Decisions already made

Phase decision 3 (one menu component, two mount points) and decision 1
(delete needs no RPC — not this task's concern, but shapes the menu's
props: it should accept an `onDelete` callback it doesn't implement itself).

Rename call shape — reuse exactly what the existing Archive button already
calls:

```ts
await updateChatSessionAction(sessionId, { title: newTitle });
```

## Checklist

- [x] `ChatSessionMenu` component: takes `onRename`/`onRequestDelete`
      callbacks (Delete invokes the callback only — T-CS1-02 supplies the
      dialog it opens). Defined locally in `chat.tsx` alongside its sibling
      small components (`GhostSelect`, `Composer`, …) rather than a separate
      file — matches this file's own convention, deviating from the plan's
      guessed file layout
- [x] Rename entry opens an inline edit (the row/header title element itself
      becomes an `<Input>`, no modal)
- [x] Empty-title guard: saving a blank/whitespace-only title keeps the
      previous title, no network call made
- [x] Mounted `ChatSessionMenu` on each rail row and in the conversation
      header (Archive icon kept as-is for now; T-CS1-02 unifies it into the
      confirmation dialog)
- [x] Renaming the open session updates both the rail row and the header
      immediately (shared `renamingId`/`renameValue` state in `ChatPage`,
      not two independent fetches) — confirmed live from both directions
- [x] `apps/web` typecheck and tests green (451 tests, 0 failures)

## Traps

- **The header and rail row must not read two independently-cached copies of
  the session.** If `chat.tsx` holds session state in more than one place,
  a rename in one won't show in the other until a refetch — confirmed this
  isn't the case (or fix it) before calling this done, per the phase's Trap.
- **Don't build a second rename affordance if a title-edit UI already exists
  anywhere in this file** — grep `chat.tsx` for any existing title-edit
  scaffolding (agent-creator sessions title themselves via `draft.name`;
  don't collide with that path).

## Verification

- [x] Rename a session via the rail row menu; confirm the header shows the
      new title without a reload — confirmed live (agent-browser, real
      signed-in session, magic-link per `doc/runbooks/agent-browser-session.md`)
- [x] Rename the currently-open session via the header menu; confirm the
      rail row updates without a reload — confirmed live, same session
- [x] Reload the page; confirm the renamed title persisted — confirmed
- [x] Attempt to save an empty title; confirm the previous title is kept,
      not blanked — confirmed
- [x] No console errors across the above; dark mode screenshot checked, no
      layout issues
- [ ] Full acceptance-scenario walk deferred to [T-CS1-03](T-CS1-03-verification.md)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done.** `ChatSessionMenu` (Rename working, Delete a stub
calling `onRequestDelete`) mounted on the rail row and the conversation
header in `apps/web/src/app/chat/chat.tsx`, defined locally alongside the
file's other small components rather than in a separate file — the plan's
guessed file layout didn't match this file's actual convention, so the code
won per the decomposing-plans skill's own rule.

Verified live: signed in via a disposable `@sparstrow.test` account through
the magic-link procedure, `agent-browser` (the Claude Browser pane's
`document.visibilityState` bug made it unusable for this — confirmed, not
assumed, per `doc/runbooks/agent-browser-session.md`). Sent a real first
message to create a session, then:
- Renamed from the rail row → header updated immediately, no reload.
- Renamed from the header → rail row updated immediately, no reload.
- Reloaded the page → rename persisted.
- Cleared the title and pressed Enter → previous title kept, nothing
  blanked, no network call.
- No console errors; dark mode screenshot checked, no layout issues.

`pnpm --filter web typecheck` clean, `pnpm --filter web test` 451/451
green. Disposable test account and its workspace cleaned up per the
runbook's SQL-equivalent cleanup (also incidentally cleared one leftover
`@sparstrow.test` account from an earlier, unrelated verification pass).

Not covered here (T-CS1-02's scope): Delete itself, and the
Archive/Delete/Cancel confirmation dialog.
