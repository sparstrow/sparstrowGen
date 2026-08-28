# T-CS1-02 — delete, with the Archive/Delete/Cancel confirmation

| | |
|---|---|
| **Tag** | `[S]` — extends `ChatSessionMenu` from T-CS1-01 |
| **Serves** | `US1` — delete half of "rename and delete a chat session, deliberately" |
| **Depends on** | T-CS1-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

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

- [x] `deleteChatSessionAction(sessionId)` in `actions.ts`, following the
      existing action pattern in this file exactly (auth context, error
      shape, revalidation)
- [x] `ChatSessionDeleteDialog`, a dedicated component (not folded into
      `ChatSessionMenu`): three buttons — Archive, Delete, Cancel — Delete
      styled destructive
- [x] Archive button calls the existing `updateChatSessionAction(id, {
      status: "archived" })`. **Removed** the standalone header Archive icon
      it duplicated — one path for session lifecycle actions, not two
- [x] Delete button calls `deleteChatSessionAction`; buttons disabled while
      the request is in flight
- [x] Deleting the **currently open** session navigates the owner away —
      confirmed live: deleting the open session lands back on the empty
      composer state, not a broken pane
- [x] A failed delete/archive keeps the dialog open and states what went
      wrong (no silent close on error)
- [x] `apps/web` typecheck and tests green (451 tests)

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

- [x] Delete a session via the confirmation; confirm it's gone from the
      rail, and gone after a reload — confirmed both via the UI and a direct
      query (`chat_sessions` row gone, its `chat_messages` cascade-deleted
      too)
- [x] Delete the **currently open** session; confirm the owner lands
      somewhere sensible, not a broken pane — confirmed, lands on the empty
      composer state
- [x] Archive via the same dialog; confirm existing archive behavior
      (session leaves the active list, is not destroyed) — confirmed, and
      confirmed it reappears when the "Archived" filter is toggled on
- [x] Cancel; confirm the session is untouched — confirmed
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

**2026-08-28 — done.** `deleteChatSessionAction` added to `actions.ts`
(hard delete, RLS-scoped, no new policy needed — confirmed live via a
direct post-delete query that the row and its cascaded messages were both
gone). `ChatSessionDeleteDialog` built as its own component (three buttons:
Archive/Delete/Cancel) rather than extending `ConfirmDialog`'s shared
two-button API, per the phase decision. The standalone header Archive icon
`ChatSessionMenu` made redundant was removed.

**Found and fixed a real, pre-existing bug while verifying live**: `GET
/chat/sessions` (`apps/web/src/lib/api/handlers/chat.ts`) silently ignored
every filter (`kind`/`projectId`/`agentId`/`status`) the client already sent
— archiving a session updated the database correctly but the session never
left the rail's default list, because the list query never actually filtered
by status (or kind/project) at all. Not introduced by this task or T-CS1-01;
it's been broken since this route shipped in M12–M15, and nothing before
this task exercised "archive, then confirm it left the list" end to end.
Documented and fixed in the same change:
[`BUG-2026-08-28-chat-sessions-list-ignores-filters`](../../bug/BUG-2026-08-28-chat-sessions-list-ignores-filters.md).

Verified live (`agent-browser`, disposable account): Cancel leaves the
session untouched; Archive removes it from the default list and it
reappears under the "Archived" toggle; Delete removes it and its messages
permanently (confirmed via a direct service-role query, not just the UI);
deleting the currently-open session lands on the empty composer state, not
a broken pane. `pnpm --filter web typecheck` clean, `pnpm --filter web
test` 451/451 green. Disposable test account cleaned up per the runbook.
