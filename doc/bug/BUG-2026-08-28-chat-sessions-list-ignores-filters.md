# BUG-2026-08-28-chat-sessions-list-ignores-filters

**Status:** 🟢 resolved
**Reported by:** agent — found verifying T-CS1-02 (Archive/Delete/Cancel confirmation, `doc/tasks/CS1/T-CS1-02-delete-confirmation.md`)
**Reported:** 2026-08-28

## Symptom

Archiving a chat session (via the new Archive/Delete/Cancel dialog, or the
prior standalone Archive icon it replaced) updates the row in Postgres
correctly, but the session never disappears from the default ("active only")
rail list — it keeps showing exactly as before, even after a full page
reload. The "Archived" toggle, and the "Filter by kind"/"Filter by project"
dropdowns, are equally inert: every session always shows regardless of any
filter selected.

## Reproduction

1. Create a chat session, send a first message.
2. Open its session menu → Delete → Archive in the confirmation dialog.
3. Confirm via direct query that `chat_sessions.status` is now `'archived'`
   for that row (it is).
4. Reload `/chat`. **Expected:** the session is gone from the default list
   (only shown once "Archived" is toggled on). **Actual:** it's still there,
   unfiltered, identically to before archiving.

100% reproducible — this is a missing `WHERE` clause, not a race or a caching
issue (ruled out below).

## Investigation

`useChatSessions` (`apps/web/src/api/hooks.ts:678`) correctly sends
`kind`/`projectId`/`agentId`/`status` as query params to `GET /chat/sessions`.
The handler that actually serves that route
(`apps/web/src/lib/api/handlers/chat.ts:57-69`) never reads any of them:

```ts
registerRoute({
  method: "GET",
  pattern: "/chat/sessions",
  handler: async ({ supabase, workspaceId }: HandlerContext) => {
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ok(data);
  }
});
```

`HandlerContext` doesn't even destructure `query`/`searchParams` here. Ruled
out before landing on this: React Query cache staleness (a hard reload
re-fetches from a cold cache — still showed the row); Next.js route caching
(`revalidatePath("/chat")` already fires on both
`updateChatSessionAction`/`deleteChatSessionAction`); the write path itself
(confirmed via a direct service-role query that `status` really is
`'archived'` in Postgres). The only remaining candidate was the read path,
and reading its actual code confirmed it — no `kind`/`project_id`/`agent_id`/
`status` filter is ever applied.

Pre-existing, not introduced by T-CS1-02 or T-CS1-01: the standalone Archive
icon T-CS1-02 replaced called the exact same list query and would have hit
the identical symptom. It went unnoticed because nothing before this task
exercised "archive a session, then confirm it left the list" end to end.

## Impact

Every one of `/chat`'s four rail filters (kind, project, status/Archived) has
been a no-op since M12–M15 shipped this route. Cosmetically low severity on
its own (the list still shows correct data, just unfiltered), but it directly
undercuts CS1's Archive feature: an owner who archives a session to declutter
their list sees no effect at all, which reads as "archiving is broken," not
"archiving worked but the list ignores it."

## Resolution

Fixed in the same change as T-CS1-02
(`apps/web/src/lib/api/handlers/chat.ts`): the handler now reads
`kind`/`projectId`/`agentId`/`status` off the request's query string and
applies each as an `.eq(...)` filter when present, matching the shape every
other filtered list route in this file already uses.

Verified closed live (`agent-browser`, disposable account): archived a
session, confirmed it left the default list without a manual refresh being
necessary beyond the existing `revalidatePath`; toggled "Archived" and
confirmed it reappeared; confirmed the kind/project dropdowns also now
filter correctly.
