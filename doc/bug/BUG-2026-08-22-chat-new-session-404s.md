# BUG-2026-08-22-chat-new-session-404s

**Status:** 🟢 resolved
**Reported by:** agent — found during T-M11-02 (M11 live verification against `staging.sparstrow.com`), while trying to start the first run of the phase from `/chat`
**Reported:** 2026-08-22

## Symptom

On `/chat`, typing a message into the "What are we working on?" free-chat
composer and clicking **Send message** fails immediately with a generic error
card reading:

```
The model failed
Not Found
```

No chat session is created and no run starts. This happens for every attempt
to begin a **new** conversation from the empty-chat composer — it is not
intermittent and not specific to the message content.

## Reproduction

1. Sign in to `staging.sparstrow.com`, navigate to `/chat`.
2. With no existing sessions, the "What are we working on?" composer is
   shown (Context: Free chat, Provider: claude-code, Model: sonnet).
3. Type any message and click **Send message**.
4. **Expected:** a new chat session is created and the message is sent to the
   agent.
5. **Observed:** the composer shows "The model failed / Not Found" and the
   network tab shows `POST /api/v1/chat/sessions` returning **404** with body
   `{"error":"Not Found"}` — a generic router miss, not a handled error from
   the chat handler.

## Investigation

`apps/web/src/lib/api/handlers/chat.ts` registers only:

- `GET /chat/sessions` (list)
- `GET /chat/sessions/:id` (get one, with its messages)

There is **no `POST /chat/sessions` route at all** — neither a real handler
nor a legible 501 stub. `apps/web/src/lib/api/handlers/stubs.ts` does
register two adjacent chat routes as deliberate, legible 501s:

```
{ m: "POST", p: "/chat/sessions/:id/messages", f: "Sending a chat message", when: "M5" },
{ m: "POST", p: "/chat/sessions/:id/retry", f: "Retrying chat", when: "M5" },
```

— i.e. sending a message *into an existing* session and retrying are both
explicitly acknowledged as not-yet-built and refuse legibly. Creating the
**first** session of a new conversation was missed entirely: it has no route
of any kind, real or stub, so the shared catch-all router returns a bare
Next.js-style 404 that the chat UI displays verbatim as "Not Found" — the
single least informative message the failure-messages contract (FR-013,
T-M11-03) exists to prevent.

Confirmed directly against staging with a signed-in session (not a local
repro): a raw `fetch('/api/v1/chat/sessions', { method: 'POST', ... })`
returns `404 {"error":"Not Found"}`.

**Not investigated further:** whether a session-creation route was ever
intended to exist as a real handler for M11, or whether `/chat` was expected
to route new conversations through `POST /runs` instead (which does work —
see below) and the composer's own "Send message" wiring is calling the wrong
endpoint. Either fix (add the route, or point the composer at the working
endpoint) belongs to whoever picks this up.

## Impact

**`/chat` cannot start a first conversation at all, for anyone, on staging.**
This is the sidebar's top nav item and the most discoverable "start a run"
entry point in the product. A user's very first attempt to talk to an agent
through the primary surface for it fails with a message that names neither
the actual cause nor a next step.

Workaround exists and was used to unblock T-M11-02: `POST /api/v1/runs` with
`agent_id` + `prompt` (the M4-built, already-verified dispatch endpoint) works
correctly and is what the rest of T-M11-02's live-run verification was run
against instead. `/chat`'s own dispatch path remains unverified and broken.

## Resolution

**Chose (a): built a real `POST /chat/sessions` handler**, not a redirect to
`/runs`. The evidence pointed at (a) decisively once traced through:

- `packages/shared/src/db/schema.ts` (~line 765) has real `chat_sessions` /
  `chat_messages` `pgTable`s with a doc comment that says outright: *"Chat is
  cloud-canonical... Turns replay history rather than resuming a provider
  session id... so a conversation carries no machine-local state and ANY
  online runtime can continue a `free` or `agent` session."* That is a
  deliberate architecture, not a stub schema.
- `packages/core/src/chat/service.ts` + `packages/core/src/api/routes/chat.ts`
  are a **complete, fully-tested** implementation of this exact API shape
  (`createChatSession`, `postChatTurn`, `retryChatTurn`, all four routes) —
  it's the daemon's local-SQLite twin of the same `chat_sessions`/
  `chat_messages` tables (same columns, same `kind` enum, same validation).
  `packages/core/src/chat/service.test.ts` already covers it.
- `packages/ui/src/routes/pages/chat.tsx`'s `send()` (line ~236) already does
  exactly the two-step flow: `useCreateChatSession().mutate(...)` on success
  calls `postTo(session.id, content)` (`POST /chat/sessions/:id/messages`).
  The frontend was never wired to `/runs` for this — it was built against a
  session-first API that the web app's cloud-side handlers just never
  finished implementing.
- `chat_sessions`/`chat_messages` already carry a workspace-scoped RLS policy
  (`packages/shared/drizzle/policies/001_rls.sql` line ~104, `for all to
  authenticated`) — the same "plain CRUD, no RPC needed" shape as `agents` and
  `projects`, unlike `runs` (which needs the `start_run` SECURITY DEFINER RPC
  because it also has to pick a runtime and enqueue a dispatch command in one
  transaction). Creating a chat session is metadata-only and needs none of
  that, so a direct `supabase.from("chat_sessions").insert(...)` — the same
  pattern `agents.ts`'s `POST /agents` already uses — is the correct amount of
  machinery.
- `apps/web/src/lib/case.ts`'s `OPAQUE_COLUMNS` already had a `chat_sessions:
  ["draft"]` entry with nothing registered to use it — a second sign a POST
  handler was intended here and just never landed.

**What was built:** `apps/web/src/lib/api/handlers/chat.ts` now registers
`POST /chat/sessions`, mirroring `createChatSession`'s validation from
`packages/core/src/chat/service.ts` so the cloud and daemon implementations
don't drift: `kind` must be one of `free | project | agent | agent-creator`;
`project` requires `projectId` and 404s if it's not in the caller's
workspace; `agent` requires `agentId`, 404s the same way, and — this mirrors
`assertCliProvider` — 400s if the agent's own provider isn't CLI-capable
(`executionModeForProvider` from `@sparstrow/shared`), then mirrors the
agent's real provider/model onto the session rather than trusting the
client's; `free`/`agent-creator` default to `claude-code`/`sonnet`. The
inserted row's `id` follows the same `chs_<random>` shape core uses.

**What was deliberately left alone:** `POST /chat/sessions/:id/messages` and
`.../retry` stay exactly the legible 501s they already were in `stubs.ts`
("... requires a paired machine. Pair one from Settings. Arriving in M5.").
Actually running a turn needs real dispatch to a paired machine's daemon —
that is a genuinely unbuilt M5 problem (streaming turns, the transcript
replay, picking an online runtime), not a missing-route bug, and building it
here would be exactly the over-engineering AGENTS.md §3.9 rules out for a
404 fix. The practical effect: creating a session now succeeds, and the
composer's very next call (posting the first message into it) surfaces the
intended, legible M5 stub message instead of a bare `Not Found` — a real
improvement even though sending still doesn't work end-to-end yet.

**Verification:** Added `apps/web/src/lib/api/chat-routes.test.ts` — dispatch
tests (route registered, not swallowed by a stub, the two adjacent M5 stubs
still respond and still say "paired machine" / "M5") plus handler-body tests
against a fake Supabase client covering all four `kind`s, the project/agent
not-found and validation paths, and the CLI-provider rejection. `pnpm -r
typecheck` is clean across all 7 packages. `pnpm --filter web test` is clean
(the only failures are the pre-existing `realtime-live-events.test.ts`
flakes, explicitly another agent's assigned bug this round, untouched by this
change). `pnpm -r test` also surfaces pre-existing Windows-environment
failures in `packages/core` (`graph-client.test.ts`, `graph-lifecycle.test.ts`,
`host-fs.test.ts`, `skills.test.ts` — temp-dir `EPERM` on cleanup and
timeouts) on files this change never touches; `git diff --stat` for this
branch shows only `apps/web/src/lib/api/handlers/chat.ts` and the new test
file. **Not verified live against a staging/preview URL** — this is a
same-package, same-pattern addition next to five other POST handlers that
already work this way (`agents.ts`, `runs.ts`, etc.), and the fake-Supabase
unit tests exercise the actual validation and row-shaping logic directly, so
a full staging pairing/sign-in pass didn't seem proportionate to a route-shape
fix. Flagging this as the honest gap rather than claiming a live pass that
didn't happen.
