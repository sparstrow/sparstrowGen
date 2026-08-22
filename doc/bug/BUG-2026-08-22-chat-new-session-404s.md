# BUG-2026-08-22-chat-new-session-404s

**Status:** 🔴 open
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

<!-- Open. Needs either a real POST /chat/sessions handler or a fix to what
     the composer calls, plus a decision on whether "send first message"
     should go through /runs directly. -->
