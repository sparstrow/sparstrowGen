# T-CS1-01 — per-session menu, with rename

| | |
|---|---|
| **Tag** | `[S]` — authors the `ChatSessionMenu` component T-CS1-02 adds a Delete entry to |
| **Serves** | `US1` — rename half of "rename and delete a chat session, deliberately" |
| **Depends on** | — |
| **Blocks** | T-CS1-02 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `ChatSessionMenu` component: takes `sessionId`, `currentTitle`, and an
      `onRequestDelete` callback (invoked on the Delete entry, no
      implementation here — T-CS1-02 supplies the dialog it opens)
- [ ] Rename entry opens an inline edit (reuse the session's existing title
      display element rather than a separate modal, matching how the rest of
      `/chat` avoids modal-for-everything)
- [ ] Empty-title guard: if the owner saves with a blank/whitespace-only
      title, fall back to the previous title rather than persisting `""`
- [ ] Mount `ChatSessionMenu` on each rail row (`chat.tsx`, session list)
- [ ] Mount `ChatSessionMenu` in the conversation header, replacing/joining
      the existing Archive icon's position
- [ ] Renaming the open session updates both the rail row and the header
      without a reload (shared state, not two independent fetches)
- [ ] `apps/web` typecheck and tests green

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

- [ ] Rename a session via the rail row menu; confirm the header shows the
      new title without a reload
- [ ] Rename the currently-open session via the header menu; confirm the
      rail row updates without a reload
- [ ] Reload the page; confirm the renamed title persisted
- [ ] Attempt to save an empty title; confirm the previous title is kept,
      not blanked
- [ ] Full acceptance-scenario walk deferred to [T-CS1-03](T-CS1-03-verification.md)

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
