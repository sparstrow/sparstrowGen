# T-M12-04 — core command-loop case + turn executor

| | |
|---|---|
| **Tag** | `[P]` — touches `packages/core/*` only; zero overlap with T-M12-03's `apps/web/*` |
| **Serves** | foundational |
| **Depends on** | T-M12-02 |
| **Blocks** | T-M12-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

The daemon-side half: a `chat.turn` case in the command claim/execute loop,
a new `chat-turn.ts` that resolves agent/project from the payload and runs
the *existing* chat logic against it, and an additive `onEvent` hook on
`completeOnce` so streamed output can be posted back as it's produced.

## Decisions already made

Cited from the plan: DD-4 (the existing poll adopts waiting turns — no
change needed here beyond handling the new command kind, since T-M12-01's
SQL does the adoption), DD-5 (stream at whatever granularity the provider
emits; probe for a delta mode, degrade silently), DD-6 (resolve agent/project
from `cloud_links`/`runtime_projects`, build the prompt on the daemon, apply
M4 decision 6's re-verification-against-the-filesystem rule).

### Confirm the `completeOnce` change is additive before relying on it

`completeOnce`'s only existing caller is the Agent Creator's local flow, with
two arguments. **Grep for every call site first** and confirm a third,
optional `onEvent` parameter changes nothing for that existing caller — this
is a claim to verify, not assume, per the phase README's own trap.

```ts
// Additive: existing 2-arg callers are unaffected.
async function completeOnce(
  input: CompleteOnceInput,
  opts: { onEvent?: (delta: { seq: number; replyText: string }) => void } = {},
): Promise<CompleteOnceResult> { /* ... */ }
```

### `packages/core/src/cloud/chat-turn.ts` — new file

Given a `ChatTurnStartPayload` (T-M12-02):

1. Resolve agent (if `agentId`/`agentSlug` present) via `cloud_links`, by
   slug — a miss is `agent_not_available`, acked through the normal command
   ack path (M4 decision 5's existing pattern, reused not reinvented).
2. Resolve project (if `projectSlug` present) via `runtime_projects`,
   **re-verified against the actual filesystem** exactly as M4 decision 6
   requires for `run.start` — a stale binding is `project_not_available`,
   and per T-M12-03, this ack path is what corrects the `chat_turns` row.
3. Build the transcript/prompt using the **existing**
   `buildTranscriptPrompt` from `packages/core/src/chat/service.ts` — do not
   reimplement prompt construction. The payload's transcript window supplies
   the message history (the cloud session's history, not local SQLite).
4. Call `completeOnce` with an `onEvent` callback that posts to
   `POST /api/daemon/chat/turns/:id/events` (T-M12-03) as `NormalizedEvent`s
   arrive — batched reasonably (do not fire one HTTP request per line if the
   provider emits rapidly; a small debounce or batch-by-N is acceptable,
   exact cadence is this task's call, not a spec requirement).
5. On completion, `POST /api/daemon/chat/turns/:id/result` with the final
   text and `status: 'succeeded'`; on failure, `status: 'failed'` with the
   error.

### DD-5's granularity probe

Probe the installed `claude-code` CLI for a partial-message/delta output
mode. If present, opt the chat path into it and events stream at genuinely
sub-message granularity. If absent, degrade silently to whatever
`NormalizedEvent`s the existing `stream-json` parsing already produces
(whole assistant messages, step updates, tool results) — this is still
"visibly growing" for a multi-step answer, just not token-level. **Record
the outcome of this probe in this task's Result section, plainly** — if no
delta mode is found, that is a `KnownGaps` entry (next free: `G-30`) opened
in this same change per `AGENTS.md` §5, not a silently narrowed claim.

### Command loop case

`packages/core/src/cloud/commands.ts`'s existing claim/execute loop gains a
`case "chat.turn":` calling the new `chat-turn.ts` executor, parallel to
however `"run.start"` is already dispatched there. No change to the poll
cadence or claim call itself — T-M12-01's SQL extension is what makes
waiting turns show up as claimable commands; this task only handles the new
`kind` once claimed.

## Checklist

- [ ] Grep confirms `completeOnce`'s only existing caller is unaffected by the new optional param
- [ ] `completeOnce` gains the optional `onEvent` callback
- [ ] `packages/core/src/cloud/chat-turn.ts` written per the steps above
- [ ] Agent resolution via `cloud_links`, miss → `agent_not_available` ack
- [ ] Project resolution via `runtime_projects`, re-verified against the filesystem, miss → `project_not_available` ack
- [ ] `case "chat.turn":` added to the command loop
- [ ] DD-5's CLI probe implemented; outcome recorded in this task's Result section
- [ ] `packages/core` typecheck and tests green

## Traps

**Do not let the daemon write chat rows into its own local SQLite.** The
cloud session's history lives in cloud Postgres; a daemon that also writes
local `chatSessions`/`chatMessages` for a cloud-dispatched turn creates two
stores that immediately disagree about the same conversation. This task's
executor reads the payload's transcript window and posts results to the
cloud routes — it does not touch `packages/core/src/db/schema.ts`'s local
chat tables at all.

**The project re-check is easy to skip because the payload already has a
`projectSlug`.** Having the slug is not the same as the project still being
there — M4 decision 6 exists because a binding can go stale between when it
was recorded and when a command actually claims. Skipping the re-check here
reproduces the exact bug M4 already fixed once, for a new code path.

**A batching choice that's too eager defeats DD-5's whole point.** Posting
one HTTP request per character or per tiny chunk turns "streaming" into
network noise; too coarse and it's indistinguishable from no streaming at
all. Pick something reasonable (batch-by-N events or a short debounce) and
say what was picked in the Result section — this is a real design choice,
not a detail to bury.

## Verification

- [ ] Unit test: `completeOnce`'s existing 2-arg call site still passes
      with identical behavior after the signature change.
- [ ] A hand-constructed `chat.turn` command with a valid agent/project
      payload, run against a real provider locally, produces streamed
      `POST .../events` calls followed by one `POST .../result` call —
      assert this end-to-end against a local mock of the two daemon routes
      (T-M12-03's real routes are verified in T-M12-06, this is a
      core-side contract test).
- [ ] A payload with a stale `projectSlug` (pointing at a path that no
      longer exists) → `project_not_available` ack, no crash.
- [ ] `pnpm --filter core typecheck` and `pnpm --filter core test` green.

## On completion

- [ ] Tick 12.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table
- [ ] `KnownGaps.md` entry (`G-30`) if DD-5's probe found no delta mode

## Result

<!-- Filled in when the task lands. State plainly what the CLI probe found. -->
