# M13 — send a message, watch the reply

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M13) |
| **Kind** | **serves US1** — ends in something the owner can open and use |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | M12 (dispatch spine), verified |
| **Blocks** | M14 (overlaps its UI seam), M15 |
| **Status** | decomposed 2026-08-23 into 5 tasks — none started |
| **Open questions** | none |

## The story this serves

> **US1 — Send a message and get a reply** ([spec](../../specs/2026-08-23-chat-message-sending.md))
>
> The owner is in a chat session — Free, a Project, or a specific Agent —
> with at least one paired machine online. They type a message and press
> send. The agent's reply appears in the session, building up as it's
> produced rather than arriving all at once after a long silence.

**Acceptance scenarios this phase must satisfy:**

1. **Given** a Free chat session and an online paired machine, **When** the
   owner sends "what does this repo do?", **Then** the composer shows the
   turn is in progress, and the agent's reply appears, growing as produced.
2. **Given** a Project-context session, **When** the owner sends a message,
   **Then** the reply reflects that project's directives, the same way a
   task run already does (per [D-20](../../Deferred.md), the lighter scope —
   directives and read-only tools, not full memory injection).
3. **Given** an Agent-persona session, **When** the owner sends a message,
   **Then** the reply comes from that agent's configured provider/model.
4. **Given** a turn already in progress, **When** the owner tries to send a
   second message, **Then** the composer refuses rather than queuing or
   overwriting it.

**Independent test:** with one paired machine online, open any chat session,
send a message, and watch a reply arrive — usable on its own, before M14's
offline handling or M15's retry exist.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Chat composer + turn | Message sent, reply streaming/complete below it | New session: composer + a short context-appropriate prompt suggestion, not a blank pane | Turn in progress: a working indicator, composer disabled for a second send | Turn failed: plain-language reason, no raw error string |

M14 owns the specific "nothing can answer" states (no machine / offline /
project unavailable) — this phase's Error state is the generic
failed-mid-turn case (provider error, daemon crash), not the waiting states.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M13-01 — `ChatTurnState` at the browser boundary](T-M13-01-turn-state-and-v1-routes.md) | `[S]` | US1 | — | ✅ done 2026-08-23 |
| [T-M13-02 — the local host answers in the same shape](T-M13-02-local-host-turn-state.md) | `[P]` | US1 | — | ✅ done 2026-08-23 |
| [T-M13-03 — hooks split, and `chat.tsx` renders a turn](T-M13-03-chat-page-turn-rendering.md) | `[S]` | US1 | 13.1, 13.2 | ✅ done 2026-08-23 |
| [T-M13-04 — the Knowledge Center stops saying chat doesn't work](T-M13-04-knowledge-center.md) | `[P]` | US1 | 13.1, 13.3 | not started |
| [T-M13-05 — verification](T-M13-05-verification.md) | `[S]` | US1 | 13.1–13.4 | not started |

13.1 and 13.2 are genuinely parallel: 13.1 is `apps/web/*` plus the
`ChatSessionDetail` change in `packages/shared`, 13.2 is `packages/core/*`,
and both compile against `chatTurnStateSchema`, which M12-02 already landed.
13.1 is `[S]` rather than `[P]` because it owns the shared contract edit that
13.2 and 13.3 both consume. 13.3 is `[S]` for two reasons: `hooks.ts` is the
~2100-line file most bands touch, and `chat.tsx` is being rewritten right now
in another worktree (see Traps).

## The shape of what was found

Reading the code before decomposing confirmed the plan's M13 outline is
buildable, and turned up four things worth naming before anyone starts.

**M12 built more than M13 needs, including all of retry's SQL.** Both
`enqueue_chat_turn` *and* `retry_chat_turn` are live on staging, and
`waiting_reason` is already computed and stored by `assign_or_park_chat_turn`.
What is missing is entirely the browser-facing half: the two v1 routes, a
producer for `ChatTurnState` (the schema exists with **zero** producers today),
and the UI.

**So M13 retires both stubs, and M15 keeps the retry *experience*.** The plan
and this phase spec both say M13 retires the two `stubs.ts` patterns, while
M15 is the retry phase — the tension is resolved by what the code makes cheap.
DD-7 puts both endpoints on one response shape feeding one render path, so
wiring `/messages` to `ChatTurnState` while leaving `/retry` returning
`ChatTurn` would reintroduce the branch DD-7 exists to remove. And `chat.tsx`'s
`TurnErrorBanner` **already calls retry today** — leaving that endpoint stubbed
would ship a visibly dead button. M13 therefore wires `/retry` to the existing
`retry_chat_turn` and carries "the failure-path retry button keeps working, on
the new contract." **M15 keeps everything user-facing about retry**: the
affordance on *succeeded* turns (US3.2's "redo with a different model"), the
model-override picker, and US3's acceptance scenarios.

**`agent-create.tsx` shares all three chat hooks with `chat.tsx`, and reads
`draftTurn` off the response.** This is the finding that most changes the
shape of the work, and the plan could not have known it. Changing
`usePostChatTurn`'s return type breaks the Agent Creator, which the plan's own
Scope boundaries put out of scope. T-M13-02 decision 1 resolves it by
narrowing DD-7 to the session kinds this spec covers and splitting the hooks by
caller — preserving DD-7's actual property (no component asks "am I hosted?")
rather than its literal wording.

**`handleError` has no branch for `SPG16`–`SPG19`.** Read
`apps/web/src/lib/api/router.ts:125–148`: an unmapped chat errcode returns a
500 reading "Internal Server Error". FR-004's requirement is a *legible*
refusal, so the mapping is not optional polish — without it the feature fails
exactly the way the spec forbids while looking fully plumbed. T-M13-01 owns it.

## What M13 deliberately does not do

`waiting_reason` is already populated and already in the contract, so it is
tempting to render the three specific "nothing can answer" cards here. **Don't
— that is [M14](../M14/README.md)**, which is graded on SC-002. M13 renders one
generic, legible waiting state (T-M13-03 decision 4): a `waiting` turn must not
fall through to the error branch, and must not lock the composer with no
explanation.

## Objective

Turn the M12 spine into something the owner can actually use: press send,
watch a reply build.

## Definition of done

- The spec's US1 acceptance scenarios 1–4, walked live.
- All four states above, both light and dark, at least Paper and Mono surfaces.
- Knowledge Center articles no longer describe sending as unavailable.
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** the specific offline/no-machine states (M14), retry
(M15), full memory injection (parked as [D-20](../../Deferred.md)),
token-level streaming beyond what the provider emits (DD-5).

---

## The owner action this phase cannot do for itself

Verification needs a real paired machine on the feature branch's own Vercel
preview — the same scratch-account pattern M11 used. No new runbook row;
[`doc/runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md)
already covers how an agent gets a signed-in session and pairs a scratch
machine.

## Traps

**A reply that streams in the local (desktop) build and only appears
complete in the cloud build is not "done."** DD-7's whole point was one
contract, one render path — if `chat.tsx` branches on which host it's
running in to decide how to render a turn, that is the exact smell
`live-events.ts` warns against.

**Don't let the composer's second-send refusal drift from the database
constraint's actual behavior.** If the UI blocks based on local state that
can go stale (e.g. a stale `isPending` flag across a tab reload), a second
tab can still hit `SPG16` from the server — which is correct, but the UI
should render that gracefully rather than as an unexplained failure.

## Verification

Full procedure in the phase's verification task, once decomposed. Graded
against the spec's SC-001 and SC-004.
