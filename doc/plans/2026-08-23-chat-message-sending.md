# Chat Message Sending — 2026-08-23

| | |
|---|---|
| **Spec** | [`../specs/2026-08-23-chat-message-sending.md`](../specs/2026-08-23-chat-message-sending.md) (Owner-reviewed 2026-08-23) |
| **Status** | ✅ Completed. M12, M13, M14, M15 all built and live-verified. The credential gap that blocked full verification (headless `claude-code` auth) was closed live 2026-08-24 — the owner ran `claude setup-token`, and this agent confirmed real chat completions, retries, and the offline→online transition through the real app on the owner's real account. All four of the plan's own verification criteria are now closed live: SC-002/SC-003 (waiting states, retry) earlier in M14/M15's own passes, and SC-001 (≥2-broadcast growing reply) / SC-004 (Project/Agent distinctiveness) on 2026-08-24 with a purpose-built scratch project and agent, cleaned up after (`G-31`'s "Closed, live" notes have the full evidence). **One accepted residual, not a blocker**: the two-online-machines race (spec edge case 3) remains unreached — needs a second paired machine, unchanged from `G-15`/`G-24`, tracked in `G-31`. |
| **Trigger** | The stub behind Chat's send button promised "arriving in M5"; M5 shipped without it (2026-08-11/12) and the promise went stale. The owner scoped it properly on 2026-08-23 rather than leave it dangling. |
| **Depends on** | M4 (command spine — poll/claim/lease/ack) and M5 (daemon → cloud ingest + server-side Realtime broadcast), both code-complete. No new dependency. |
| **Touches** | `packages/shared/src/db/schema.ts`, `packages/shared/drizzle/policies/014_chat_turn_dispatch.sql`, `packages/shared/drizzle/policies/015_chat_broadcast.sql`, `packages/shared/src/cloud.ts`, `packages/shared/src/schemas/chat.ts`, `apps/web/src/lib/api/handlers/chat.ts`, `apps/web/src/lib/api/handlers/stubs.ts`, `apps/web/src/app/api/daemon/chat/turns/[id]/events/route.ts`, `apps/web/src/app/api/daemon/chat/turns/[id]/result/route.ts`, `apps/web/src/lib/daemon/broadcast.ts`, `apps/web/src/lib/case.ts`, `apps/web/src/lib/realtime-live-events.ts`, `packages/core/src/cloud/commands.ts`, `packages/core/src/cloud/chat-turn.ts` (new), `packages/core/src/chat/service.ts`, `packages/core/src/orchestrator/one-shot.ts`, `packages/ui/src/lib/live-events.ts`, `packages/ui/src/routes/pages/chat.tsx`, `packages/ui/src/api/hooks.ts`, `packages/ui/src/content/knowledge/chat-and-inbox.md` (+ the four global-claim articles per `AGENTS.md` §3.2) |
| **Tasks** | [`doc/tasks/M12/`](../tasks/M12/README.md) (6 tasks, fully decomposed), [`doc/tasks/M13/`](../tasks/M13/README.md), [`doc/tasks/M14/`](../tasks/M14/README.md), [`doc/tasks/M15/`](../tasks/M15/README.md) |
| **Open questions** | none |

## Summary

Serves [the chat-message-sending spec](../specs/2026-08-23-chat-message-sending.md).
A chat turn becomes a **durable cloud row that the existing M4 command spine
dispatches as a `chat.turn` command** — the kind `runtime_commands.kind` has
named in its schema comment since M1 — and the reply streams back over **M5's
exact ingest-then-broadcast path**, a daemon HTTP POST that writes durably and
fans the same batch out from the route that already holds the service role. No
new transport, no daemon Realtime auth, no push to the daemon
([D-12](../Deferred.md) stays parked, per the spec's Assumptions).

The turn logic itself is not redesigned: `packages/core/src/chat/service.ts`
already resolves Free/Project/Agent context and builds the prompt correctly for
the local single-daemon topology. This plan gives that logic a second
entrypoint — one whose session history arrives in the command payload instead of
from local SQLite, and whose output is streamed to the cloud instead of inserted
into a local table.

## What the spec asks for that isn't obvious

**Three things in the spec cost more than they read like.**

**1. "Not lost" (US2.2) contradicts a settled M4 decision.** M4 decision 7 is
explicit: *offline is not a queue* — `POST /runs` returns `409
no_runtime_available` rather than parking work for a machine that may be shut
until Monday. US2.2 requires the opposite for chat: the message waits and is
answered automatically once a machine appears. That is not an oversight in
either document — a run is a button the owner can press again, and a chat
message is prose they would have to retype. See DD-3 for how both survive.

**2. "Reflects that project's directives and memory the same way a task run
already does" (US1.2) is stronger than what exists.** The local chat path runs
through `completeOnce`, which is documented as *"NO run row, NO memory
injection"*. Project chat today gets a synthetic agent with a project-flavoured
system prompt and read-only `Read`/`Grep`/`Glob` — it can *look things up*, but
no directive or memory block is injected the way `RunManager` injects one. The
spec's sentence, read literally, is a request for memory injection on the chat
path. DD-6 scopes what US1 actually delivers and what is parked.

**3. "Growing as it's produced" is bounded by what the CLIs emit.** Providers
here are driven headless with `--output-format stream-json` and parsed
line-by-line into `NormalizedEvent`s — but those lines are **whole messages and
step updates, not token deltas**. A one-paragraph answer with no tool calls is
one `assistant` line followed by `result`: streamed, arriving as one block.
SC-001 says "not a single delayed block of text." DD-5 decides what ships and
what gets recorded honestly rather than assumed.

## Work breakdown

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| `chat_turns` table, indexes, in-flight constraint, RLS policies (delegated to `data-modeler`; see DD-2) | Schema. The owner sees a reply, never a row. |
| Enqueue + assignment SQL functions, and the `chat.turn` runtime-eligibility predicate shared with `start_run` | A database function nobody opens |
| `chat.turn` command kind, payload, ingest/result contracts and constants in `packages/shared/src/cloud.ts` | A shared type file; serves all three stories equally |
| `POST /api/daemon/chat/turns/:id/events` + `.../result` — durable write, then broadcast (M5's shape) | Daemon-facing transport; no browser reaches it |
| `015_chat_broadcast.sql` — `realtime.messages` subscribe policy for `chat:<ws>:<session>` | A policy. Its absence is invisible until someone else's tab receives a reply. |
| Core: `chat.turn` case in the command loop; `packages/core/src/cloud/chat-turn.ts` executing the turn from payload history; `completeOnce` gains an optional `onEvent` | Daemon-side plumbing; the owner sees only its output |
| `LiveEventSource.subscribeChat` + the Realtime implementation | Transport seam behind the chat page |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1 — send and get a streaming reply** | Retire the two `stubs.ts` patterns; `POST /chat/sessions/:id/messages` enqueues; `GET /chat/sessions/:id` returns the active turn; `chat.tsx` renders turn state + streamed deltas + working indicator; second-send refusal (FR-004) | Owner sends a message in a Free / Project / Agent session and watches the reply build |
| **US2 — told plainly when nothing can answer** | Waiting-reason tokens resolved at enqueue and re-resolved at each poll; the three states rendered as legible cards with a pairing link; project-not-anywhere reuses `runtime_projects`; wait-TTL expiry state | Owner with no machine, an offline machine, or an unbound project sees what is wrong and what to do |
| **US3 — retry a turn** | `POST /chat/sessions/:id/retry` enqueues a new turn against the same user message, with an optional provider/model override; retry affordance on failed **and** completed turns; prior reply retained | Owner re-asks without retyping, optionally on another model |

## Decisions

### DD-1 — A chat turn is a `chat.turn` command, not a run

The reply streams the same way a transcript does, so making a chat turn *be* a
run — `runs` row, `run_events`, M5's pusher, the existing `seq` merge in the UI
— would reuse the entire pipe for free. It is rejected on three counts, in
order of weight:

1. **`runs.agent_id` is `not null`, and Free/Project chat has no agent row.**
   The chat service builds a *synthetic, non-persisted* agent (`chatAgent()`).
   Dispatch resolves agents by slug through `cloud_links` and acks
   `agent_not_available` on a miss (M4 decision 5), so chat-as-run would mean
   minting `chat-free`/`chat-project` agent rows in both the cloud and every
   daemon's SQLite — the opening move of definition sync, which is
   [D-9](../Deferred.md) and deliberately not built.
2. **The Runs board is a board.** Every chat turn would appear in the runs list,
   the cost rollups, and anything that later counts runs. A chat turn is a
   message exchange, and `chat-and-inbox.md` already tells users chat history is
   separate from Runs.
3. **`run_events.run_id` has an FK to `runs.id`**, and M5's own trap list says a
   push for a run with no cloud row is a permanent FK violation. Inverting that
   relationship for chat would put the exception in the hot path.

What is reused instead is everything that is not `runs`-specific: the command
row with claim/lease/ack, the 3s poll, `POST /api/daemon/*` bearer auth, the
ingest-then-broadcast route shape, the byte-budgeted chunking in
`planBroadcast`, and the topic/policy pattern from `010_transcript_broadcast.sql`.

### DD-2 — The turn's state lives in a dedicated `chat_turns` table

*(Schema, indexes, constraints and RLS delegated to the `data-modeler`
sub-agent; its design is incorporated below and is the input to the
foundational phase's schema task — not re-derived here.)*

**Shape.** `chat_turns` carries: workspace and session, the `chat_messages` id
of the user message it answers, a status, the assigned `runtime_id` (nullable —
a waiting turn has none), a waiting-reason token, the provider/model actually
used (so a retry override is recorded rather than inferred), a link to the turn
it retries, the partially-streamed reply plus the high-water sequence that makes
ingest idempotent, and the timestamps the derived states are computed from
(created, assigned, last event, wait deadline).

**Why a table and not columns on `chat_messages`.** A turn has a lifecycle, an
owner machine, and a failure mode; a message has none of those. Hanging six
nullable dispatch columns off `chat_messages` would put dispatch state on every
row of a table that is read for rendering, and would make "one turn in flight
per session" (FR-004) unexpressible as a constraint, because the guard needs a
predicate over *turns*, not messages.

**Idempotency is a primary key, not hope.** `run_events` is keyed `(run_id,
seq)` for exactly this reason and M5's ingest upserts with
`ignoreDuplicates` — chat ingest inherits the rule: a replayed batch after a
lost response must be free.

**The in-flight guard is a database constraint** (a partial unique index over
`session_id` for non-terminal statuses), not a handler check. FR-004 is a
correctness property under a double-click and two open tabs, and the handler
that reads-then-writes is the shape M2's defect 9 was.

### DD-3 — A chat turn waits, bounded; a run still refuses

M4 decision 7 refuses to queue for an offline machine, and this plan does not
reopen that for runs. Chat diverges, deliberately and only here:

- **Refusing loses the owner's prose.** The spec's US2.2 says the message is not
  lost and the reply arrives when a machine picks it up. A 409 makes the owner
  retype — which is also what US3 exists to eliminate.
- **The failure M4 was avoiding is bounded by a deadline.** "Close the laptop on
  Friday, eleven runs start on Monday" is prevented by a **wait TTL**, after
  which the turn moves to `expired` with retry offered — not by refusing to
  accept the message at all. A chat reply that arrives days late is useless, so
  the TTL is short (proposed: 10 minutes, a named constant in
  `packages/shared/src/cloud.ts` beside `COMMAND_POLL_INTERVAL_MS`).

Rejected: **refuse like `start_run` does** (loses the message; fails US2.2), and
**wait forever** (reproduces exactly the Monday-morning surprise M4 named).

### DD-4 — The polling runtime adopts waiting turns; no scheduler is added

`runtime_commands.runtime_id` is `not null`, so a turn that arrives with nothing
online cannot be a command row yet. Something must later notice a machine has
appeared and hand it the work.

**That something is the poll that already happens.** The claim path
(`claim_runtime_commands`, called every 3s per runtime by
`packages/core/src/cloud/commands.ts`) gains a step that atomically assigns
eligible waiting turns to the claiming runtime and materialises their
`chat.turn` commands. The daemon's loop shape does not change at all — it just
sees a new `kind`.

Rejected: **a `pg_cron` sweeper** (new infrastructure, and a second place that
decides what "eligible" means); **a doorbell that pushes to the daemon**
(D-12, and the owner's Assumptions rule this out); **assigning at enqueue
only** (leaves a waiting turn stranded forever once the first attempt found
nothing, which is precisely US2.2's case).

Eligibility — online by `last_heartbeat` (never `runtimes.status`, per M3
decision 4 and `isRuntimeOnline`), provider present in `capabilities`, and for a
Project session `runtime_projects.state = 'bound'` — is the same predicate
`start_run` already applies. It is extracted once and called from both, not
copied: two divergent answers to "can this machine do this?" is how a run and a
chat turn end up disagreeing about the same laptop.

### DD-5 — Streaming granularity is whatever the provider emits, and that is stated, not assumed

The CLIs are spawned with `--output-format stream-json` and every stdout line is
parsed into `NormalizedEvent`s already — so pushing deltas costs an optional
`onEvent` callback on `completeOnce` (additive; the Agent Creator's existing
call is unchanged). What it does **not** buy is token-level streaming: those
lines are whole assistant messages, step updates, and tool results.

So US1's phase does two things in order: **(a)** stream at the granularity the
provider gives, which for a tool-using or multi-step answer is genuinely
incremental, and **(b)** probe the installed `claude-code` CLI for a
partial-message/delta mode and opt the chat path into it when present, degrading
silently to (a) elsewhere. If (b) is unavailable, SC-001 is met in the weaker
sense — visible progress and a working indicator, with a short answer still
landing as one block — and that is recorded as a `KnownGaps` entry (next free:
`G-30`) in the same change, per `AGENTS.md` §5. It is not quietly ticked.

Rejected: **claiming SC-001 on the strength of the transport alone** (the
transport streams; the model may not), and **synthesising fake deltas by
chunking the finished text** (an animation that lies about what the machine is
doing — the exact class of thing `ai-design-slop` names).

### DD-6 — The daemon runs the *existing* chat logic against payload-supplied history

`postChatTurn` / `runTurn` read the session, the transcript, the agent and the
project from **local SQLite**. A cloud-dispatched turn's session and history
live in cloud Postgres, and the daemon must not write chat rows into its own
database — two stores would immediately disagree about the same conversation.

So the `chat.turn` payload carries what the turn needs: session kind, the
transcript window, provider/model, `agentSlug` + `agentId` for an Agent session,
`projectSlug` + `projectId` for a Project session (ids *and* slugs travel
together for the same reason `RunStartPayload` does). The daemon resolves agent
and project locally through `cloud_links` and the `runtime_projects` binding,
re-verifies the project against the filesystem exactly as M4 decision 6
requires, and acks `agent_not_available` / `project_not_available` on a miss.

**The prompt is built on the daemon, not in the cloud.** `buildTranscriptPrompt`
is already pure over a message array and already enforces
`TRANSCRIPT_BUDGET_BYTES`, which exists because a CLI provider passes the prompt
as an argv value against Windows' ~32 KB command-line limit. That budget belongs
on the machine with the command line. Rejected: rendering the prompt at enqueue
(a second copy of the windowing rules in the cloud, frozen at enqueue time).

**On US1.2's "memory and directives":** what ships is today's project context —
the project-scoped system prompt with read-only repository tools — carried
faithfully to a remote machine, plus the project's directives, which the cloud
already stores and can put in the payload cheaply. Full memory injection is
`RunManager`'s, sits behind a run row and the memory-MCP wiring `completeOnce`
deliberately skips, and pulling it into the chat path is a second feature. If
the owner reads US1.2 as requiring the memory block too, that is a scope change
to agree before US1's phase is decomposed — flagged here rather than silently
narrowed, and parked as [D-20](../Deferred.md) if it is not taken now.

### DD-7 — One contract shape for both topologies: every turn is asynchronous

`ChatTurn` today is synchronous — `{ session, userMessage, assistantMessage,
error }` — because the local daemon answers in-process, and `packages/ui`'s
`usePostChatTurn` consumes that shape for **both** hosts. The cloud path cannot
return an assistant message from the POST; the reply does not exist yet.

The contract becomes **one async shape used by both**: `POST .../messages`
returns the turn's *state*, and the local Fastify route returns the same shape
already in a terminal state with the assistant message attached. The UI then has
one code path — render the turn, subscribe while it is non-terminal — rather
than branching on which host it is running in.

Rejected: **a second response type for the cloud** (`packages/ui` would have to
ask "am I hosted?", which `live-events.ts` documents as the question a component
must never ask, and G-6 is the standing example of what sniffing costs), and
**a discriminated union** (the same branch, spelled more politely, in every
consumer).

Per the shared-contracts skill: schemas change in
`packages/shared/src/schemas/chat.ts`, consumed by `apps/web`'s v1 handler,
core's Fastify chat routes, and `packages/ui`'s hooks — **all updated in the
same change**, since there is no independent deploy and no version flag.
`chatTurnRequestSchema` / `chatRetryRequestSchema` keep their fields.

> **Narrowed during M13's decomposition (2026-08-23), not overturned.** "One
> async shape used by both" turns out to break the Agent Creator:
> `packages/ui/src/routes/pages/agent-create.tsx` shares all three chat hooks
> with `chat.tsx` and reads `draftTurn` off the response — a field
> `ChatTurnState` has no business growing, since agent-creator sessions keep
> the local path by this plan's own Scope boundaries. The narrowing: `free` /
> `project` / `agent` sessions use `ChatTurnState` on **both** hosts;
> `agent-creator` keeps `ChatTurn` locally and its 501 in the cloud. DD-7's
> actual property is preserved — no component asks "am I hosted?", because the
> split is by session kind, which each page knows statically. Full reasoning:
> [`doc/tasks/M13/T-M13-02`](../tasks/M13/T-M13-02-local-host-turn-state.md)
> decision 1.

### DD-8 — Validation posture: pass-through for the browser, strict parse for the daemon

Two boundaries, two postures, chosen deliberately:

- **Browser → `/api/v1`**: pass-through in the house style, with **one clamp** —
  a byte ceiling on `content`. A chat message becomes an argv-bound prompt on
  someone's machine; an unbounded one is a spawn failure on a laptop rather than
  a 400 in a route. The `draft` field stays exactly as it is: agent-creator
  drafts are the repo's reference clamp case (`agent-draft.ts` + `clampDraft`)
  and this plan does not touch that.
- **Daemon → `/api/daemon`**: strict, whole-batch-or-nothing parse, mirroring
  `parseEventBatch`. Storing the sane subset of a bad batch makes the corruption
  permanent *and* advances the sender's cursor past events that never landed.

`OPAQUE_COLUMNS` in `apps/web/src/lib/case.ts` gains a `chat_turns` entry for
any jsonb column the data model lands with (the structured turn error is the
likely one); the streamed reply is `text` and needs no entry.

### DD-9 — Death and expiry are derived at read time, made durable by the next write that cares

A machine that dies mid-reply acks nothing and posts nothing. Something must
turn that into a legible failed turn (spec edge case 1) rather than a reply that
silently stops growing.

**No sweeper.** Staleness is computed from `last_event_at` against a named
constant — the same discipline as `isRuntimeOnline`, which M3 chose precisely
because a machine that dies writes nothing and a stored `online` stays `online`
forever. The derivation is exported once from `packages/shared/src/cloud.ts` for
the route and the UI; the enqueue/assign functions apply the same threshold in
SQL so a stale turn cannot block the next send. **Trap for whoever writes it:**
that threshold then exists in TypeScript and in SQL, and the two must be
changed together — the SQL carries a comment naming the constant.

Rejected: **`pg_cron`** (infrastructure and a second definition of dead) and
**client-only derivation** (a closed tab means the turn is never resolved, and
FR-004's guard would refuse the next message forever).

### DD-10 — Chat broadcasts get their own topic and their own policy

Topic `chat:<workspaceId>:<sessionId>`, per **session** rather than per turn, so
that navigating within a conversation does not churn channels and a retry's
deltas arrive on the channel already open.

`010_transcript_broadcast.sql` is scoped `split_part(topic, ':', 1) = 'run'` —
its own comment says other features will add topics and that a policy
authorising every topic-shaped thing would silently grant them too. So chat gets
a sibling file (`015_chat_broadcast.sql`, next free number after 013) with the
identical membership shape, **select only**: there is deliberately no insert
policy, because a client able to write to a chat channel could forge agent
output into a stream the UI merges with real replies.

`chat_turns` is **not** added to the `postgres_changes` publication —
`002_realtime.sql`'s measured argument against double delivery applies here
unchanged, and the broadcast already carries the payload rather than a signal to
refetch.

## Phases

### M12 — chat turn dispatch spine (foundational)

Schema, RLS, enqueue/assign functions, the shared contracts and constants, both
daemon routes with broadcast, the broadcast policy, the core command-loop case
and turn executor, and `subscribeChat` on the live-event source.

**Depends on:** nothing new (M4 and M5 are code-complete).
**Done when:** a `chat.turn` command enqueued by hand is claimed by this
machine, executes, streams deltas that land in `chat_turns` and arrive on the
`chat:` topic, and finishes with an assistant `chat_messages` row — asserted
without any UI. Cross-workspace isolation re-proved through HTTP for both new
daemon routes, since they hold the service role (M5's trap, and M4's defect).

### M13 — send a message, watch the reply (serves US1)

Retire the two stub patterns, wire `POST /messages` and the session read,
rebuild `chat.tsx`'s composer/turn rendering against turn state instead of a
mutation result, and land the four states from the spec's Interface section.
Includes DD-5's granularity probe and, if it fails, the `G-30` entry.

Also carries the Knowledge Center obligation (`AGENTS.md` §3.2): sending works
now, so `chat-and-inbox.md`'s "does not work yet" limitation is a user-visible
lie the moment this lands — and `what-is-sparstrowgen.md`, `first-run-setup.md`,
`limitations.md` and `providers-and-execution-modes.md` are re-read for the
global claims they carry about what needs a paired machine.

**Depends on:** M12. **Done when:** the spec's US1 scenarios 1–4 pass against a
feature-branch Vercel preview with this machine paired (`AGENTS.md` §2 rule 3).

### M14 — nothing can answer, said plainly (serves US2)

Waiting-reason resolution at enqueue and at each assignment attempt, the TTL
expiry transition, and the three states rendered with a real link to pairing.
`project_not_available` reuses the `runtime_projects` binding and the same words
`start_run` already produces, per US2.3.

**Depends on:** M12; overlaps M13's UI work, so decompose after M13's rendering
seam exists rather than alongside it.
**Done when:** with zero paired machines, with a paired-but-offline machine, and
with a Project session bound to no online machine, the owner sees three
different, actionable states — and the offline case answers by itself when the
machine comes back inside the TTL.

### M15 — retry (serves US3)

`POST /retry` enqueues a fresh turn against the same user message with an
optional model override; the previous reply stays in history; retry is offered
on failed, expired, and completed turns.

**Depends on:** M12 and M13. **Done when:** the spec's US3 scenarios 1–2 pass,
and the original message was never retyped.

## Scope boundaries

- **No push to the daemon.** [D-12](../Deferred.md) stays parked; dispatch
  latency stays bounded by `COMMAND_POLL_INTERVAL_MS`. This is the spec's
  Assumptions section, and it is worth noting that D-12's own "unpark when"
  clause names *interactive chat turns* — the owner decided on 2026-08-23 that
  this feature does not trigger it, because reusing the proven poll costs one
  poll interval and building the doorbell costs a second daemon authentication
  model.
- **Team manager chat** (`POST /teams/:id/manager/chat`) keeps its stub. The
  spec puts it out of scope; the spine built here should serve it in a later
  pass.
- **Chat notification preferences and other Settings surface work** are the
  spec's other exclusion and belong to [I-10](../Ideas.md).
- **Settings check (`AGENTS.md` §14), performed:** the only genuinely
  configurable behaviours introduced here are the wait-TTL and a per-session
  default model. The model is already per-session in the composer, and a
  user-facing dial for the TTL configures a failure path the owner should rarely
  see — building either would be the over-engineering §9 forbids. **No settings
  entry is built**, and this sentence is the record that the check happened.
- **Memory injection on the chat path** is not built — see DD-6's escalation. If
  the owner does not take it now it is parked as `D-20`.
- **Token-level streaming** beyond what a provider emits is not built — DD-5.
- **`agent-creator` sessions keep the local path.** They call
  `runAgentDraftTurn` and mutate a session `draft`; `POST /agents/draft` is a
  separate stub with its own 501. Dispatching drafts remotely is not in this
  spec's three stories.
- **The local, core-served UI's chat is not re-architected.** Its Fastify routes
  keep answering in-process; only the response *shape* changes (DD-7).

## Verification

The live pass runs against **the feature branch's own Vercel preview** with this
Windows machine paired (`AGENTS.md` §2 rule 3), not against
`development.sparstrow.com`.

| Spec criterion | How it gets checked |
|---|---|
| **SC-001** — a sent message produces a visibly growing reply | With one machine paired and online, send a prompt that forces multiple provider messages (a Project session question requiring several file reads). Assert deltas arrive in ≥2 broadcasts and the rendered reply grows between them. **Honesty condition:** for a short single-message answer this is one block — if DD-5's probe finds no partial-message mode, SC-001 is graded on the multi-message case only and `G-30` records the rest. |
| **SC-002** — zero online machines never dead-ends | Three walks, all in the browser: (a) a workspace with no machine ever paired, (b) a paired machine with its daemon stopped past the heartbeat window, (c) a Project session whose project is bound to no online machine. Each must name what is missing and link to pairing/Machines. Assert no raw error string and no generic toast. |
| **SC-003** — retry never requires retyping | After a failed turn (stop the daemon mid-reply) and after a completed turn, press retry with a different model. Assert the user message was never re-entered, the new reply used the chosen model, and the previous reply is still in the transcript. |
| **SC-004** — Project/Agent replies are observably not generic | Same question in a Free session and in a Project session for a repo with a distinctive file; assert the Project reply cites repository content the Free one cannot know. Then an Agent session whose agent has a distinctive system prompt and a non-default model; assert the reply's recorded provider/model matches the agent's, not the default. |

**Additional assertions that are not spec criteria but are how this class of
work has failed before, in this repo:**

- **Cross-workspace isolation, through HTTP**, for both new daemon routes and
  for a chat topic subscribe — the service role bypasses RLS and M4 shipped
  exactly this defect, caught only live.
- **Exactly-once under replay**: the same delta batch posted twice stores no
  duplicate and still advances the high-water seq.
- **FR-004 under a race**: two sends fired simultaneously into one session leave
  exactly one turn in flight, refused by the constraint and not by luck.
- **Navigate away mid-turn and return** (FR-007): the reply is present and still
  growing, not restarted.

**Named early, per the skill:** verification needs one paired machine and a
deployed preview. Both exist. What cannot be reached in this plan is the
two-machines case — "either of two online machines may answer a Free session"
(spec edge case 3) — which is the same constraint `G-15` and `G-24` already
carry. It gets a `KnownGaps` entry rather than a ticked box.

## Result

All four phases (M12–M15) built and live-verified against real staging
Postgres, a real paired machine, and — once the owner closed the headless
`claude-code` credential gap (`claude setup-token`, 2026-08-24) — real model
completions. Every one of the plan's own verification criteria is closed
live: SC-001 (≥2-broadcast growing reply), SC-002 (zero-online-machines
never dead-ends, all three waiting-reason cards plus TTL expiry), SC-003
(retry never requires retyping, including a real model-picker override),
and SC-004 (Project/Agent replies observably distinctive — a Project session
cites real repository content a parallel Free session provably can't know,
and an agent's own configured model shows up in the recorded turn, not the
session default). Full evidence for each is in `doc/KnownGaps.md`'s `G-31`
entry and its phase-level task Results (`T-M12-06`, `T-M13-05`, `T-M14-03`,
`T-M15-03`).

**Two real defects were caught by verification, not by review**, both fixed
in the same pass they were found: `GET /chat/sessions/:id` was returning the
session's columns spread onto the response's top level instead of nested
under `session`, which made the cloud chat UI render as permanently empty
for every session kind until a real browser session-hydration pass caught
it (`T-M13-05`); and headless CLI spawns inherited the operator's personal
`~/.claude` config unisolated, which broke every headless turn on a machine
with a certain class of personal skill installed
(`BUG-2026-08-23-headless-spawn-skill-leak`).

**One accepted residual, tracked and not a blocker:** the two-online-machines
race (spec edge case 3) has never been reached — it needs a second paired
machine, which doesn't exist in this environment. Same shape of limitation
as `G-15`/`G-24` from earlier milestones, which this repo has shipped
through before. `G-31` carries the full record and clears when a second
machine is available to walk it live.
