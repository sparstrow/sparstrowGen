# M13 — send a message, watch the reply

| | |
|---|---|
| **Plan** | [doc/plans/2026-08-23-chat-message-sending.md](../../plans/2026-08-23-chat-message-sending.md) (M13) |
| **Kind** | **serves US1** — ends in something the owner can open and use |
| **Spec** | [doc/specs/2026-08-23-chat-message-sending.md](../../specs/2026-08-23-chat-message-sending.md) |
| **Depends on** | M12 (dispatch spine), verified |
| **Blocks** | M14 (overlaps its UI seam), M15 |
| **Status** | not started — individual tasks to be decomposed once M12 lands, per this repo's own precedent (M5's decomposition depended on what M4's dispatch actually turned out to look like) |
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

Decomposed once M12 lands. Expected shape, from the plan's Work breakdown:

- Retire the two `stubs.ts` patterns for `POST /chat/sessions/:id/messages` and `.../retry`
- `POST /chat/sessions/:id/messages` calls `enqueue_chat_turn`; `GET /chat/sessions/:id` returns the active turn (T-M12-02's `chatTurnStateSchema`)
- `chat.tsx` rewired to render turn state + streamed deltas + working indicator, subscribing via T-M12-05's `subscribeChat` while non-terminal
- Second-send refusal (FR-004) surfaced in the composer, not just enforced by the database constraint
- Knowledge Center pass (`AGENTS.md` §3.2): `chat-and-inbox.md`'s "does not work yet" limitation becomes false the moment this lands — rewrite it, and re-read `what-is-sparstrowgen.md`, `first-run-setup.md`, `limitations.md`, `providers-and-execution-modes.md` for the global claims they carry about chat needing a paired machine
- Verification task `[S]`, walking US1's four acceptance scenarios against the feature branch's own Vercel preview with a real paired machine

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
