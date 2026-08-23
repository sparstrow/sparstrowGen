# Spec: Chat Message Sending

| | |
|---|---|
| **Status** | Owner-reviewed 2026-08-23 |
| **Created** | 2026-08-23 |
| **Trigger** | Surfaced while discussing Settings & customization (I-10). The owner asked whether chat's "requires a paired machine, arriving in M5" message needed anything from them to build — investigation found M5 had already shipped (2026-08-11/12) without it, so the promise is now stale, and the owner decided (2026-08-23) to scope this properly rather than leave it dangling. |
| **Plan** | doc/plans/2026-08-23-chat-message-sending.md, once written |
| **Open questions** | none |

## The experience today

The owner can open Chat, create a session (Free, tied to a Project, or tied to an Agent persona), and type a message. Pressing send always fails with a plain error: *"Sending a chat message requires a paired machine. Pair one from Settings."* There is no path from that error to actually getting a reply, no matter what the owner does — the send button always fails this way, paired machine or not. The Chat & Inbox help article used to claim replies stream in with the same cost tracking as a run; that claim was corrected on 2026-08-22 to say sending doesn't work yet at all.

## What I expect instead

Sending a message in a chat session works the way starting a run already works: it goes to a paired, online machine, the agent's reply streams in as it's produced (not as one long wait followed by a wall of text), and if nothing is available to answer, the owner is told that plainly and shown what to do about it — not handed a generic error. Retrying a turn that failed or that the owner wants to redo (e.g. with a different model) should not require retyping the message.

---

## User stories

### US1 — Send a message and get a reply (Priority: P1)

The owner is in a chat session — Free, a Project, or a specific Agent — with at least one paired machine online. They type a message and press send. The agent's reply appears in the session, building up as it's produced rather than arriving all at once after a long silence.

**Why this priority:** This is the entire feature. Nothing else here matters if this doesn't work.

**Independent test:** With one paired machine online, open any chat session, send a message, and watch a reply arrive.

**Acceptance scenarios:**

1. **Given** a Free chat session and an online paired machine, **When** the owner sends "what does this repo do?", **Then** the composer shows the turn is in progress, and the agent's reply appears in the session, growing as it's produced.
2. **Given** a Project-context chat session, **When** the owner sends a message, **Then** the reply reflects that project's directives and memory the same way a task run already does — the owner is talking to an agent that knows the project, not a blank one.
3. **Given** an Agent-persona chat session, **When** the owner sends a message, **Then** the reply comes from that agent's configured provider/model/behavior, not a default.
4. **Given** a turn is already in progress in a session, **When** the owner tries to send a second message before the first reply finishes, **Then** the composer refuses ("wait for the current reply, or send after it finishes") rather than silently queuing or overwriting it.

---

### US2 — Told plainly when nothing can answer (Priority: P1)

The owner sends a message with no paired machine online (none paired at all, or all paired machines currently offline). Instead of a dead-end error, they're told why nothing is happening and given the obvious next step.

**Why this priority:** Without this, a quiet install looks broken instead of correctly waiting — the same trap the current generic stub falls into. This is what makes the P1 loop trustworthy rather than a coin flip.

**Independent test:** With zero paired machines (or all offline), send a message and read what the owner is shown.

**Acceptance scenarios:**

1. **Given** no machine has ever been paired, **When** the owner sends a message, **Then** they see "this needs a paired machine to reply" with a direct link to pairing (Machines/Settings), not a raw error string.
2. **Given** a machine is paired to the workspace but is currently offline, **When** the owner sends a message in a Free or Agent session, **Then** they see "waiting for a machine to come online" — the message is not lost, and the reply arrives automatically once a machine picks it up.
3. **Given** a Project-context chat session where no paired machine has that project checked out locally, **When** the owner sends a message, **Then** they're told this project isn't available on any online machine, the same way starting a run for that project already tells them.

---

### US3 — Retry a turn (Priority: P2)

The owner didn't like a reply, or it failed partway, and wants to try again — optionally with a different model — without retyping their message.

**Why this priority:** Turns fail (a provider hiccup, a bad model choice) and replies aren't always useful the first time. Not P1 because the owner can already work around it today by resending the same text manually; this just removes the friction.

**Independent test:** After a completed or failed turn, use retry and confirm the original message isn't lost and a new reply arrives.

**Acceptance scenarios:**

1. **Given** a turn that failed partway through, **When** the owner presses retry, **Then** the same message is resent and a fresh reply attempt starts, without the owner retyping anything.
2. **Given** a completed reply the owner wants redone with a different model, **When** they retry and pick a different model, **Then** the new reply uses that model and the original reply stays visible in the session history rather than being erased.

---

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Chat session view (`/chat`) | Existing | Sends a message, watches the reply arrive, retries a turn |
| Machines / Settings pairing | Existing | The link the "no machine available" state points to |

### The four states

| State | What the owner sees |
|---|---|
| **Populated** | The message the owner sent, followed by the agent's reply, streaming in as it's produced. A turn in progress shows a clear "thinking / working" indicator, not a frozen composer. |
| **Empty** | A brand-new session shows the composer and a short prompt suggesting what to ask, per context (Free / this project / this agent) — not a bare blank pane. |
| **Loading** | While a reply is being generated, the reply area shows a working indicator (not a spinner standing in for the whole page) and the composer is disabled for a second send until the turn resolves. |
| **Error** | A turn that fails shows why in plain language (provider error, no machine available, project not present on any online machine) and offers retry where that makes sense. No raw error strings or stack traces. |

### Flow

The owner opens a chat session, types a message, and presses send. If a machine is available and able to answer, the reply starts appearing within moments and keeps growing until it's done. If nothing can answer right now, the owner is told why and where to fix it (pair a machine, wait for one to come online, or check the project is available somewhere). If a turn finishes unsatisfyingly, retry resends the same question, optionally on a different model.

## Edge cases

- What happens if the machine handling a turn goes offline or crashes mid-reply? The owner should see the turn end in a clear failed state with retry available, not a reply that silently stops growing with no explanation.
- What happens if the owner navigates away mid-turn and comes back? The reply should have kept building in the background and be there (complete or still in progress) when they return, not restarted or lost.
- What happens if two paired machines are both online for a Free/Agent session — does it matter which one answers? The owner shouldn't need to know or care which machine handled it, only that a paired machine did.
- What happens to a Project-context session if a machine that had it checked out is unpaired or removed after the session was created? The next message should hit the same "not available anywhere" state as US2.3, not fail some other way.

## Requirements

### Functional requirements

- **FR-001**: Owner MUST be able to send a message in any chat session (Free, Project, or Agent) and receive a reply from an online paired machine.
- **FR-002**: The reply MUST appear incrementally as it is produced, not only after the full reply is complete.
- **FR-003**: A Project-context reply MUST reflect that project's directives and memory; an Agent-context reply MUST use that agent's configured provider, model, and behavior.
- **FR-004**: System MUST prevent a second message from being sent into a session while a turn is still in progress.
- **FR-005**: When no paired machine is available to answer (none paired, all offline, or — for a Project session — none with that project available locally), the owner MUST see a specific, actionable explanation rather than a generic error.
- **FR-006**: Owner MUST be able to retry a turn (same message, optionally a different model) without retyping it.
- **FR-007**: A turn in progress MUST continue and be recoverable if the owner navigates away and returns, rather than being lost or silently abandoned.

### Key entities

- **Chat turn**: One send-and-reply exchange within a session — the owner's message, which machine (if any) is handling it, its current state (waiting for a machine / in progress / complete / failed), and the reply content as it builds.

## Success criteria

- **SC-001**: With one paired machine online, a sent message produces a visibly growing reply, not a single delayed block of text.
- **SC-002**: With zero online paired machines, sending a message never produces a dead-end generic error — it always names what's missing and links to the fix.
- **SC-003**: Retrying a turn never requires the owner to retype their original message.
- **SC-004**: A Project or Agent chat session's reply is observably different from a Free session's reply in a way that reflects that project's or agent's configuration (not interchangeable, generic output).

## Assumptions

- Reused dispatch pattern, not push: per the owner's 2026-08-23 decision, this reuses the same poll-based dispatch and broadcast-back mechanism already built and proven for task runs (M4/M5), rather than building new push-based delivery to the daemon (parked in [D-12](../Deferred.md)). This means a chat turn's delay before a machine picks it up is bounded by the same short poll interval a run already accepts — not instant, but not a meaningfully different experience from starting a run today.
- Context-awareness (a Project session seeing that project's directives/memory, an Agent session using that agent's configuration) is existing behavior in the local single-machine chat implementation being extended to the cloud-dispatched path here, not new logic being invented from scratch.
- Scope boundary: this spec covers one-on-one owner↔agent chat turns only. Team manager chat (`POST /teams/:id/manager/chat`) is a separate stub with the same stale "Arriving in M5" promise and is explicitly out of scope here — worth its own pass once this ships, since the underlying dispatch mechanism should be reusable.
- Scope boundary: chat notification preferences and other Settings-surface work for chat (raised while discussing I-10) are explicitly out of scope for this spec — they're about how the owner is told about replies, not about replies existing at all, and belong to the settings spec this work was cut from.

## Owner review

**Reviewed:** 2026-08-23 — accepted, no changes requested.
