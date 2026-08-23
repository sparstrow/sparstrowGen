# BUG-2026-08-23-chat-stub-stale-m5-promise

**Status:** 🟢 resolved
**Reported by:** agent — found while scoping
[`doc/specs/2026-08-23-chat-message-sending.md`](../specs/2026-08-23-chat-message-sending.md)
during a settings-spec discussion, after the owner asked whether sending a
chat message needed anything before it could be built.

## Symptom

`apps/web/src/lib/api/handlers/stubs.ts` stubbed `POST
/chat/sessions/:id/messages`, `.../retry`, and `POST
/teams/:id/manager/chat` with `when: "M5"`, producing the message *"...
requires a paired machine. Pair one from Settings. Arriving in M5."* M5 (Band
7 in `doc/tasks/MasterTaskQueue.md`) shipped 2026-08-11/12, and its own phase
spec says explicitly: *"M5 does not build memory sync, chat streaming, or
transcript archiving."* The promise was never kept and never going to be —
M5 came and went without it, so every owner reading that message since
2026-08-12 was being told a specific, false ETA.

## Reproduction

1. Read `doc/tasks/M5/README.md` line 38 — chat streaming is explicitly out
   of M5's scope.
2. Compare against `doc/tasks/MasterTaskQueue.md` Band 7 — all of M5's own
   tasks are marked done (2026-08-11/12).
3. Compare against `apps/web/src/lib/api/handlers/stubs.ts`'s
   `needsRuntimePatterns`, which still said `when: "M5"` for the three chat
   entries as of 2026-08-23.

## Investigation

The `stubs.ts` header comment already names this exact failure mode: *"These
all used to say 'Arriving in M4'. M4 shipped the dispatch spine ... and none
of the rest, because each [milestone] carries its own scope."* Chat message
sending was apparently written against an earlier, broader idea of what M5
would cover (the comment right above the chat entries — "Chat over the spine
needs streaming turns, which is a transcript problem" — reads like it assumed
M5's transcript work would carry chat along with it), and nobody updated the
`when` field once M5's actual scope narrowed and shipped without chat.

## Impact

Low severity — no functional breakage, sending a message was already broken
regardless of the ETA text — but a specific wrong promise is worse than a
vague one: it teaches the owner to expect something on a timeline that
already passed, then leaves them checking a case that will never resolve
until someone acts on it.

## Resolution

Changed all three `when: "M5"` entries to `when: null`, which
`needsRuntimeError()` renders as "It is not scheduled yet." instead of a
specific (wrong) milestone. Added a comment pointing at
`doc/specs/2026-08-23-chat-message-sending.md`, the spec now scoping the
real feature — the owner decided the same day to build it, reusing the
already-proven poll-dispatch/broadcast pattern from M4/M5 rather than the
push-based "doorbell" parked in D-12. No test asserted the old string, so no
test changes were needed. Fixed alongside filing this report, in
`apps/web/src/lib/api/handlers/stubs.ts`.
