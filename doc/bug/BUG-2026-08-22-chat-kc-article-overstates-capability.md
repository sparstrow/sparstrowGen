# BUG-2026-08-22-chat-kc-article-overstates-capability

**Status:** 🟢 resolved
**Reported by:** agent — found while fixing
[`BUG-2026-08-22-chat-new-session-404s`](BUG-2026-08-22-chat-new-session-404s.md)
and checking `packages/ui/src/content/knowledge/chat-and-inbox.md` per
AGENTS.md §3.2's "check the articles you did not touch" rule.

## Symptom

The **Chat & Inbox** Knowledge Center article
(`packages/ui/src/content/knowledge/chat-and-inbox.md`) describes Chat as
already fully working:

> **Chat** is the conversational surface: session-based, **streaming**,
> markdown-rendered.

and, in its own "Known Limitations & Boundaries" section:

> Chat sessions use the same run machinery as everything else — **each reply
> is a run** you'll find in [Runs](/knowledge/runs-and-transcripts), with the
> same cost and provenance tracking.

Neither is true today. Sending a message into a chat session — `POST
/chat/sessions/:id/messages` and `.../retry` — is a deliberate, legible 501
in `apps/web/src/lib/api/handlers/stubs.ts` ("... requires a paired machine.
Pair one from Settings. Arriving in M5."), not a streaming reply, and not a
row in the `runs` table at all — chat turns run through
`packages/core/src/chat/service.ts`'s own `chat_messages` table, entirely
separate from `runs`/`run_events`. This is not a regression from the
session-creation fix (`BUG-2026-08-22-chat-new-session-404s`) — this
overstatement predates it and is unrelated to that route.

## Reproduction

1. Open `/knowledge/chat-and-inbox` (or read the source file directly).
2. Compare against `apps/web/src/lib/api/handlers/stubs.ts`'s
   `needsRuntimePatterns` entries for `POST /chat/sessions/:id/messages` and
   `.../retry`, both `when: "M5"`.
3. Compare against `packages/core/src/chat/service.ts` — chat turns write to
   `chat_messages`, not `runs`.

## Investigation

Traced while establishing the architecture for the session-creation fix.
`apps/web/src/lib/api/handlers/chat.ts`'s `GET` handlers and the new `POST
/chat/sessions` read/write the cloud `chat_sessions`/`chat_messages` tables
directly (`packages/shared/src/db/schema.ts`); nothing in that cloud path
touches `runs`. The "same run machinery... each reply is a run" claim looks
like it may describe an *intended future* architecture (or a description
carried over from an earlier design where chat turns really did dispatch
through `runs`) rather than what ships. Not fully root-caused — worth
checking `doc/plans/` and `doc/tasks/` for the milestone that wrote this
article originally, to see whether "each reply is a run" was ever true or
aspirational from the start.

## Impact

Per AGENTS.md §3.2, this is user-visible: a user reading this article before
M5 ships is told chat already streams and that replies show up in the Runs
view with cost/provenance tracking — neither is true, and the actual failure
mode they'll hit (the M5 stub's "requires a paired machine" message) isn't
mentioned at all. Low urgency (chat's first-message flow doesn't fully work
end-to-end yet either, per `BUG-2026-08-22-chat-new-session-404s`'s
Resolution — sending is still M5-stubbed), but it compounds the same
overstating problem AGENTS.md flags as "the dangerous direction."

## Resolution

Confirmed aspirational, not carried-over-and-then-broken: `chat_sessions` and
`chat_messages` were designed as their own tables, separate from `runs`/
`run_events`, from the very first cloud-schema plan
([`doc/plans/2026-08-09-daemon-cloud-control-plane.md`](../plans/2026-08-09-daemon-cloud-control-plane.md)
lines 58-62, 181-185) — "each reply is a run" was never true at any point in
this app's history. "Streaming" was never true either; sending a chat message
is a deliberate 501 stub (`apps/web/src/lib/api/handlers/stubs.ts`,
`POST /chat/sessions/:id/messages`, `when: "M5"`).

Rewrote `packages/ui/src/content/knowledge/chat-and-inbox.md`:
- Dropped the "streaming" claim from the intro and added a sentence noting a
  session can be created today but sending into it needs a paired machine and
  isn't available yet.
- Replaced the "each reply is a run... cost and provenance tracking" claim in
  Known Limitations with the actual behavior: chat turns are their own
  history, separate from Runs, with no transcript/cost/provenance entry the
  way a task run gets.
- Bumped `updated:` to 2026-08-22.

Left as a standalone doc fix rather than folding into M5 — the article will
need a second pass once M5 ships turn-sending regardless, and there's no M5
task yet to fold it into.
