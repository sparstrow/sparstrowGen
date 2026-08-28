# T-CS1-02 — delete, with the Archive/Delete/Cancel confirmation

| | |
|---|---|
| **Tag** | `[S]` — extends `ChatSessionMenu` from T-CS1-01 |
| **Serves** | `US1` — delete half of "rename and delete a chat session, deliberately" |
| **Depends on** | T-CS1-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

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

## Objective

A new `deleteChatSessionAction` server action, and the Archive/Delete/Cancel
confirmation dialog wired to `ChatSessionMenu`'s Delete entry (T-CS1-01).

## Decisions already made

Phase decision 1: delete is a direct RLS-scoped query.

```ts
// apps/web/src/app/chat/actions.ts
export async function deleteChatSessionAction(sessionId: string) {
  const ctx = await requireWorkspaceContext(); // match the existing action's auth pattern
  const { error } = await ctx.supabase.from("chat_sessions").delete().eq("id", sessionId);
  if (error) return actionFail(error.message);
  revalidatePath("/chat"); // match createChatSessionAction/updateChatSessionAction's own revalidation
  return actionOk();
}
```

Confirm the exact auth-context helper and `actionFail`/`actionOk` shape
against `createChatSessionAction` in the same file — copy its pattern
exactly rather than inventing a parallel one.

Phase decision 2: the dialog's copy names the conversation/message history,
not "memory" as a system name — e.g. *"Delete this conversation? Its message
history will be permanently removed and can't be recovered."*

## Checklist

- [ ] `deleteChatSessionAction(sessionId)` in `actions.ts`, following the
      existing action pattern in this file exactly (auth context, error
      shape, revalidation)
- [ ] `ChatSessionDeleteDialog` (or inline in `ChatSessionMenu`): three
      buttons — Archive, Delete, Cancel — Delete styled as destructive
- [ ] Archive button calls the existing `updateChatSessionAction(id, {
      status: "archived" })` — no new code, just routed through this dialog
      instead of (or in addition to) the header icon
- [ ] Delete button calls `deleteChatSessionAction`; buttons disabled while
      the request is in flight
- [ ] Deleting the **currently open** session navigates the owner away
      (rail root, or the next session in the list) rather than leaving the
      pane pointed at a now-deleted id
- [ ] A failed delete/archive keeps the dialog open and states what went
      wrong (no silent close on error)
- [ ] `apps/web` typecheck and tests green

## Traps

- **The generic member RLS policy makes this delete permissive by design —
  do not add an extra ownership check the phase's own research didn't find
  a need for.** Any workspace member may already delete any session in that
  workspace (same as they can already archive or rename one); this is
  existing, accepted behavior for every table under that policy, not a gap
  to close in this task.
- **Deleting the open session and forgetting to redirect** is the single
  most likely silent failure here — the conversation pane has no session to
  render and either crashes or shows a stale one. Test this path explicitly,
  not just deleting a session from the rail while looking at a different one.

## Verification

- [ ] Delete a session via the confirmation; confirm it's gone from the
      rail, and gone after a reload (query `chat_sessions` directly, or
      confirm a 404-equivalent on its old id)
- [ ] Delete the **currently open** session; confirm the owner lands
      somewhere sensible, not a broken pane
- [ ] Archive via the same dialog; confirm existing archive behavior
      (session leaves the active list, is not destroyed)
- [ ] Cancel; confirm the session is untouched
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
