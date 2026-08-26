# BUG-2026-08-26-chat-session-updates-always-404

**Status:** 🟢 resolved
**Reported by:** agent — converting `T-WA-03`'s `agent-create.tsx` writes to Server Actions
**Reported:** 2026-08-26

## Symptom

Every action that updates an existing chat session — renaming it, switching
its model mid-conversation, or archiving it — silently fails with a 404. On
`/chat`, the title-rename field, the model switcher in the session header,
and "Archive" from the session menu all appear to do nothing (or show a
generic "Not Found" if the caller surfaces the error). On the Agent Creator
(`/agents/create`), the interview session is supposed to auto-archive itself
right after the agent is created; it never actually does.

## Reproduction

1. Open `/chat`, start or resume a session.
2. Rename it, switch its model, or choose "Archive" from its menu.
3. Expected: the change persists. Actual: the request 404s
   (`PATCH /api/v1/chat/sessions/<id>` — no such route).

Confirmed by reading the handler, not yet reproduced live through the
`/chat` UI itself (that page is `T-WA-07`'s territory, not exercised during
this task's verification pass). Reproduced live for the Agent Creator's own
archive-on-create call, prior to this fix — see Investigation.

## Investigation

`useUpdateChatSession()` (`apps/web/src/api/hooks.ts`) calls
`PATCH /chat/sessions/${id}`. `apps/web/src/lib/api/handlers/chat.ts`
registers `POST /chat/sessions`, `GET /chat/sessions`, `GET
/chat/sessions/:id`, `POST /chat/sessions/:id/messages`, and `POST
/chat/sessions/:id/retry` — **no `PATCH` route for `/chat/sessions/:id` at
all**, not a stub, nothing. Any `PATCH` to that path 404s before reaching
application code.

Two call sites are affected:
- `apps/web/src/app/agents/create/agent-create.tsx` — archives the interview
  session after the agent is created (`updateSession.mutate({id, data:
  {status: "archived"}})`).
- `apps/web/src/app/chat/chat.tsx` — rename (line ~548), model switch (line
  ~563), and archive (line ~767).

`ChatSessionUpdate` (`packages/shared/src/schemas/chat.ts`) is `{title?,
status?, provider?, model?}` — a plain partial update against real columns
on `chat_sessions` (all four are written by the sibling `POST
/chat/sessions` insert), so there is no missing design decision here, unlike
some of this phase's other findings — just a route that was never built.

## Impact

Chat session rename, mid-conversation model switching, and archiving (both
from `/chat` and from the Agent Creator) have never worked on the cloud/web
app. Low severity — none of these block using chat itself, and there is no
data-loss risk (the update simply never happens) — but three real, discoverable
pieces of UI have quietly done nothing since they shipped.

## Resolution

**Fully fixed.** `T-WA-03` built `updateChatSessionAction` in
`apps/web/src/app/chat/actions.ts` — a real Server Action doing the
`chat_sessions` update the missing route never did — and converted
`agent-create.tsx`'s one call site to it. `T-WA-07` converted `chat.tsx`'s
remaining three call sites (rename, model switch, archive) onto the same
action and deleted `useUpdateChatSession` from `hooks.ts`.

Verified live 2026-08-26 for both consumers:
- Agent Creator: created an agent through the Agent Creator (which
  auto-archives its interview session on success); no error surfaced.
- `/chat`: switched a live session's model (`sonnet` → `opus`) via the
  header's model select, confirmed via `GET /chat/sessions/:id` that the
  change persisted across a reload; archived the same session from the
  header's archive button and confirmed the "This session is archived and
  read-only" composer state rendered.

Backed additionally by unit tests exercising the same update directly
against a mocked `chat_sessions` row (`apps/web/src/app/chat/actions.test.ts`).
