# BUG-2026-09-03 — the turn timeout is shorter than the CLI's retry ladder, so every auth failure reports as "the provider timed out"

**Status:** 🔴 Open. Root cause measured; not yet fixed.
**Found:** 2026-09-03, re-testing [`G-27`](../KnownGaps.md) from a clean shell.
**Severity:** High for diagnosis, not for correctness. Nothing is corrupted; the
owner is simply told the wrong thing about why their agent did not reply, and
told it three minutes late.

## What happens

A chat turn dispatched to a machine whose `claude` CLI has an expired OAuth
token fails with:

> the provider timed out

It did not time out in any meaningful sense. The CLI answered clearly; nobody
was still listening.

## The measurement

`claude -p --output-format stream-json --verbose --max-turns 1`, run with every
`CLAUDE*`/`ANTHROPIC*` variable stripped so it matches what
`orchestrator/child-env.ts` hands a spawned agent:

```
elapsed 186.1s, exit 1
{"type":"system","subtype":"api_retry","attempt":1,...,"error_status":401,"error":"authentication_failed"}
... attempts 2 through 10, exponential backoff ...
{"type":"result","is_error":true,
 "result":"Failed to authenticate. API Error: 401 … OAuth access token has expired."}
```

## Root cause

| | |
|---|---|
| CLI retry ladder, 10 attempts with backoff | **~186 s** |
| `TURN_TIMEOUT_MS`, `server/src/chat/service.ts:43` | **120 s** |

The daemon kills the child **66 seconds before** the CLI emits its `result`
event, then reports its own generic message from
`server/src/orchestrator/one-shot.ts:160`:

```ts
finish({ text: null, sessionId, isError: true, errorMessage: "the provider timed out" });
```

**The provider already knows how to report this correctly.** `extractResult` in
`server/src/providers/claude-code.ts` reads `result.result` specifically so an
expired-token message survives — its own comment records the M4 session where
reading `subtype` instead produced "a failed run whose error column said
success". That code is right. It never receives a result event to run on.

So this is not a missing feature. It is a working error path that a shorter
timeout amputates.

## Why raising the ceiling is the wrong fix

Setting `TURN_TIMEOUT_MS` above 186 s would surface the message, at the cost of
making every genuinely-stuck turn hang for over three minutes. It also pins an
internal constant to an undocumented retry schedule in someone else's binary,
which will change.

**Fix it at the signal instead.** The CLI announces the problem on its very
first attempt, ~1 second in:

```json
{"type":"system","subtype":"api_retry","attempt":1,"error_status":401,"error":"authentication_failed"}
```

`parseLine` already normalises `system` events. An `api_retry` carrying
`error_status: 401` is not a transient condition worth ten retries — it is a
terminal one. Abort the turn on it and report *"your Claude CLI needs
re-authenticating"* immediately.

That converts a 186-second silence into a one-second, accurate, actionable
message, and it does not depend on any timeout value.

## Related

- [`G-27`](../KnownGaps.md) — the capability probe cannot tell "the binary runs"
  from "it can authenticate". Same underlying situation, different half: G-27 is
  about *predicting* the failure, this is about *reporting* it once it happens.
  Both are fixed by reading what the CLI already says about its own auth state.
- The owner's token being expired is a separate, immediate fact: agent turns
  cannot succeed on this machine until they re-run the CLI's login.
