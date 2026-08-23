# T-M12-04 — core command-loop case + turn executor

| | |
|---|---|
| **Tag** | `[P]` — touches `packages/core/*` only; zero overlap with T-M12-03's `apps/web/*` |
| **Serves** | foundational |
| **Depends on** | T-M12-02 |
| **Blocks** | T-M12-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-23 |

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

- [x] Grep confirms every `completeOnce` call site is unaffected by the new optional param (see Result — the phase README's premise that there is only ONE caller was wrong; there are five)
- [x] `completeOnce` gains the optional `onEvent` callback
- [x] `packages/core/src/cloud/chat-turn.ts` written per the steps above
- [x] Agent resolution via `cloud_links`, miss → `agent_not_available` ack
- [x] Project resolution via `runtime_projects`, re-verified against the filesystem, miss → `project_not_available` ack
- [x] `case "chat.turn":` added to the command loop
- [x] DD-5's CLI probe implemented; outcome recorded in this task's Result section
- [x] `packages/core` typecheck and tests green

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

- [x] `completeOnce`'s existing 2-arg (and 3-arg, sans `onEvent`) call sites
      still pass with identical behavior after the signature change — proven
      by the FULL existing suite staying green (`chat/service.test.ts`,
      `agents/draft-service.test.ts`, `agents/pipeline-draft-service.test.ts`,
      `api/routes/teams.test.ts`, `memory/utility-llm.ts`'s callers), not just
      a new test of the new param.
- [x] A real subprocess (`one-shot.test.ts`, `node -e` standing in for a CLI
      provider) proves `onEvent` fires with the progressive text, then the
      final text, in order, and does not re-fire for an unchanged text —
      this is closer to real than "a local mock of the two daemon routes"
      the task doc proposed, since it exercises the actual spawn/readline
      wiring rather than assuming it.
- [x] `chat-turn.test.ts` covers agent/project/free-session resolution, the
      in-flight replay guard, event batching (3 pushes → 1 POST), the
      terminal-`seq`-exceeds-every-streamed-`seq` invariant, and both
      `completeOnce`-returns-an-error and `completeOnce`-throws failure
      paths — all against a mocked `completeOnce` (matching `chat/service.test.ts`'s
      own established boundary: one-shot's spawn internals are proven
      separately, callers are proven against the mock).
- [x] A payload with a stale `projectSlug` → `project_not_available`, no
      crash (`chat-turn.test.ts`).
- [x] `commands.test.ts` gained two dispatch-wiring tests: `chat.turn` acks
      `done` immediately (before `completeOnce` — mocked to never resolve —
      settles), and an unresolvable agent acks `failed`/`agent_not_available`.
- [x] `pnpm --filter core typecheck` and `pnpm --filter core test` green
      (also ran `pnpm -r typecheck` and the full `pnpm test`, 5/5 workspaces,
      709 core tests + 4 skipped, up from 692 — the 17 new tests above).

## On completion

- [x] Tick 12.4 (17.4) in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row
- [x] Update the phase README's task table
- [x] `KnownGaps.md` entry (`G-30`) — DD-5's probe found no delta mode; entry opened in this same change

## Result

**The grep-confirm step found the phase README's own premise wrong, worth
recording plainly.** "`completeOnce`'s only existing caller today is the
Agent Creator's local flow" (README.md's "shape of what was found" section)
is not true — there are FIVE real call sites: `chat/service.ts`'s
`attemptChatCompletion` (the LOCAL chat turn path this very phase is the
cloud counterpart to), `agents/draft-service.ts` (Agent Creator, the one
the README named), `agents/pipeline-draft-service.ts` (a documented near-
duplicate of the draft-service path), `memory/utility-llm.ts` (synchronous
in-run memory-search completions), and `api/routes/teams.ts` (team manager
chat). None of this changes the safety of the change — `onEvent` is
optional and every existing call site omits it, so "additive" holds for all
five, not just the one the README anticipated — but the premise itself was
worth correcting rather than silently building on it.

**DD-5's granularity probe: no delta mode found, and that finding is now
`KnownGaps.md` `G-30`.** Every CLI provider's `parseLine` (`claude-code.ts`
and its siblings) maps a provider's own `stream_event` lines into an opaque
`status` `NormalizedEvent` without extracting partial text — the finest
signal available is "a new complete assistant message arrived," which
`extractResult`'s existing fallback-to-`lastAssistantText` already produces
on a partial event list. `onEvent` reuses that exact function (`cli.extractResult(events)`
called after every new stdout line, firing only when the derived text
actually changes) rather than re-deriving "the text so far" a second way.
Whole-message granularity, stated plainly, not silently narrowed.

**What was built beyond the task doc's own outline, and why:**

- **`ChatTurnStartPayload` gained a `messages` field, and a new migration
  (`016_chat_turn_transcript.sql`) populates it.** The task doc's step 3
  said "the payload's transcript window supplies the message history" —
  but T-M12-01/T-M12-02's `ChatTurnStartPayload` (already committed) never
  actually carried one; it had turnId/sessionId/agent+project ids+slugs/
  provider/model/attempt only. A daemon has no local record of a cloud
  session's `chat_messages` to read instead (the phase's own Trap forbids
  writing them locally, and there was never a route to fetch them from
  either). Closed by extending `private.assign_or_park_chat_turn` to embed
  the last 50 messages (oldest first) directly in the dispatched command's
  payload — the same pattern `start_run`'s `prompt` field already uses,
  not a second HTTP round trip. Applied and live-verified against staging:
  a hand-enqueued turn's `runtime_commands.payload->'messages'` held exactly
  `[{"role":"user","content":"first message"}]`. `buildTranscriptPrompt`
  itself is unmodified — its existing count/byte windowing runs on top of
  this superset, unchanged.
- **`chatAgent` (the synthetic free/project agent builder in
  `chat/service.ts`) was refactored to take `kind: ChatSessionKind` instead
  of a whole `ChatSession`**, and exported. The cloud path has no local
  session row to pass it — only the payload's `sessionKind`. This is the
  "reuse the existing chat logic, not reimplement it" DD-6 asks for, made
  possible rather than assumed.
- **`buildTranscriptPrompt`'s parameter type widened** from `ChatMessage[]`
  to `Pick<ChatMessage, "role" | "content">[]` — the payload's `messages`
  only ever carries those two fields, never a local id or timestamp a
  cloud-sourced message doesn't have. The existing local caller (`runTurn`)
  still satisfies the narrower type; this is a pure widening.
- **`TURN_TIMEOUT_MS` exported from `chat/service.ts`** so the cloud
  executor uses the exact same 120s ceiling rather than a second constant
  that could drift from it.
- **The in-flight replay guard is in-memory only (`inFlight: Set<string>`
  in `chat-turn.ts`), not persisted**, unlike `run.start`'s `runManager.getRun()`
  check. Per the phase's own Trap (no local chat rows), there is nothing to
  persist it INTO. Recorded explicitly in `chat-turn.ts`'s own header
  comment as a narrower, bounded window than `run.start`'s: it does not
  survive a process restart, but `ingest_chat_turn_reply`'s idempotent,
  seq-scoped writes mean a genuine double-execution cannot corrupt the row —
  at worst two completions race and the higher `seq` wins. Not treated as a
  gap requiring its own KnownGaps entry — it is a documented, bounded design
  property, not an unproved claim.
- **Batching cadence: an 800ms debounce timer, not batch-by-N.** `pusher.push`
  arms a single `setTimeout` on the first delta after a flush and every
  subsequent push before it fires rides the same batch; the timer clears
  itself and re-arms on the next push after a flush. Picked over batch-by-N
  because a chat reply's event cadence is bursty (several assistant messages
  in a tool-using turn can land within milliseconds of each other) rather
  than steady, and a fixed 800ms ceiling bounds worst-case staleness without
  needing to guess a good N. The DURABLE write only ever needs the latest
  event in a batch (see T-M12-03's `latestOf`); this batching is purely
  about not spamming the events route, not about correctness.
- **The command's ack fires as soon as the turn is ACCEPTED, mirroring
  `run.start` exactly** — `runChatTurnCommand` returns synchronously once
  agent/project resolution succeeds and the async execution has been kicked
  off (`void executeChatTurn(...)`), never waiting for `completeOnce` to
  settle. Completion is reported entirely through T-M12-03's routes, the
  same split `run.start`'s ack vs. `/runs/:id/status` reporting already has.

**Live verification performed** (staging, real online scratch machine
`2c138115-e57d-4952-9905-5ec31487ac10`): applied `016_chat_turn_transcript.sql`,
confirmed a hand-enqueued turn's dispatched command payload carries the
correct `messages` array, confirmed the real (older-build) daemon still
correctly rejects the still-locally-unbuilt `chat.turn` kind exactly as
before — expected, since T-M12-04's code exists only in this branch, not
deployed anywhere. Security advisor re-run: unchanged from the established
baseline. All scratch data deleted afterward (0/0/0 confirmed).

**What is NOT yet verified:** the real HTTP round trip from a running
instance of this branch's `core` daemon through T-M12-03's actual deployed
routes with a real bearer token — recorded as `G-30`'s second half, to be
closed by T-M12-06 once a build of this branch exists somewhere to point a
daemon at.
