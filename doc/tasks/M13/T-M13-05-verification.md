# T-M13-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M13 in place |
| **Depends on** | T-M13-01, T-M13-02, T-M13-03, T-M13-04 |
| **Blocks** | M14, M15 decomposition |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove US1 for real: a message sent from a browser produces a reply from a real
paired machine, rendered as it arrives.

**Where this runs.** Against **this feature branch's own Vercel preview** with a
paired machine, per `AGENTS.md` §2 rule 3 — not `development.sparstrow.com`.
[`doc/runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md)
covers getting a signed-in session and pairing a scratch machine; M11's
`T-M11-01` is the worked precedent.

**What this pass cannot reach, named up front rather than discovered at the
bottom:**

- **A second paired machine.** Spec edge case 3 ("either of two online machines
  may answer") is unreachable for the same reason `G-15`, `G-24` and `G-31`
  already record. §D, and it stays a `KnownGaps` entry.
- **Possibly a real successful CLI completion.** `G-31` records that M12's pass
  had no usable Anthropic credentials for a spawned headless `claude -p`, and
  hit `authentication_failed`. **If that is still true here, §A cannot be
  ticked at all** — the entire story is "a reply arrives". Establish this
  *first*, before anything else in this task, and if the credentials are still
  missing, stop and say so rather than grading M13 on the transport alone.
  A phase that cannot demonstrate its own user story is not done; it is blocked,
  and blocked is a reportable state.

## A — The acceptance scenarios

Reached the way a user reaches them: open `/chat`, click, type. No hand-built
URLs, no ids typed in.

- [ ] **US1 scenario 1** — Given a Free session and an online paired machine,
      When "what does this repo do?" is sent, Then the composer shows the turn
      in progress and the reply appears, growing as produced
- [ ] **US1 scenario 2** — Given a Project session, When a message is sent,
      Then the reply reflects that project's directives — graded per SC-004
      below, which is the assertion that makes "reflects" checkable
- [ ] **US1 scenario 3** — Given an Agent session whose agent has a
      non-default provider/model, When a message is sent, Then the reply's
      recorded provider/model is the agent's, not the default. Check the
      persisted turn row, not just the badge.
- [ ] **US1 scenario 4** — Given a turn in progress, When a second message is
      attempted, Then the composer refuses. Then do it again **from a second
      browser tab**, which the first tab's local state cannot know about — the
      server's `409 turn_in_progress` must render legibly, not as a raw error
      (the phase README's second trap)
- [ ] **The story's independent test** — with only M13 present, open any
      session, send, and watch a reply arrive. Usable without M14 or M15.
- [ ] Browser console clean on load and through a full turn

### SC-001 — a visibly growing reply

- [ ] Send a prompt that forces **multiple provider messages** (a Project
      session question needing several file reads). Assert deltas arrive in
      **≥2 broadcasts** and the rendered reply grows between them.
- [ ] **Honesty condition, from the plan:** for a short single-message answer
      this is one block, and per [`G-30`](../../KnownGaps.md) that is the real
      granularity. Grade SC-001 on the multi-message case only, and do not
      report the single-block case as a defect or as a pass.

### SC-004 — Project/Agent replies are observably not generic

- [ ] Same question in a Free session and in a Project session for a repo with
      a distinctive file; the Project reply cites repository content the Free
      one cannot know
- [ ] The Agent session's recorded provider/model matches the agent's

## A2 — The four states

Every one looked at deliberately, in a browser, at Paper **and Mono** surfaces
(Mono is the honest worst case), light and dark.

- [ ] **Populated** — message, then reply, correct order, correct session
- [ ] **Empty** — a brand-new session shows the context-appropriate prompt, not
      a blank pane
- [ ] **Loading** — working indicator in the reply area (not a page spinner),
      composer disabled for a second send
- [ ] **Error** — stop the daemon mid-reply. The turn ends in a legible failed
      state with plain language and no raw error string. **This is spec edge
      case 1** and it exercises `CHAT_TURN_STALE_MS`'s read-time derivation —
      a reply that silently stops growing is the failure being checked for.
- [ ] **Waiting** — M13's single generic state (T-M13-03 decision 4). It must
      read as waiting, not as an error, and must not permanently lock the
      composer. The three *specific* states are M14's and are **not** graded
      here.
- [ ] Keyboard navigation and visible focus work; nothing scrolls sideways

## B — What must NOT have changed

- [ ] **The Agent Creator still completes an interview**, on the local host.
      T-M13-02/03 renamed its hooks and left its response shape alone; this is
      the regression that rename could cause.
- [ ] **`POST /chat/sessions/:id/messages` on an agent-creator session still
      returns its 501** on the cloud host — a deliberate refusal
      (T-M13-01 decision 4), not a gap for a later reader to "fix"
- [ ] **`POST /teams/:id/manager/chat` still returns its 501.** Out of the
      spec's scope; a helpful-looking wiring of it is a regression
- [ ] Creating a session, listing, filtering, archiving and the session rail
      all still work — `POST /chat/sessions` was only built on 2026-08-22
      ([BUG-2026-08-22-chat-new-session-404s](../../bug/BUG-2026-08-22-chat-new-session-404s.md))
- [ ] Starting a **run** is unaffected — `claim_runtime_commands` gained a chat
      preamble in M12 and both paths share it

## C — Reachable with one machine

- [ ] **FR-007, navigate away and back.** Send, navigate to another route
      mid-turn, return. The reply kept building and is present — not restarted,
      not lost. This is the assertion that proves `activeTurn` on the session
      read is actually wired, and it cannot be faked by mutation state.
- [ ] **Reload mid-turn.** Same, with a full page refresh — the harder case,
      since every piece of component state is gone.
- [ ] **Exactly-once under replay.** POST the same delta batch twice to
      `/api/daemon/chat/turns/:id/events` with the daemon's bearer token:
      no duplicate text, `replySeq` still advances correctly.
- [ ] **FR-004 under a genuine race.** Two sends fired simultaneously at one
      session leave exactly one turn in flight — refused by the partial unique
      index, not by luck or by UI timing.
- [ ] **Cross-workspace isolation through HTTP**, re-proved for the two v1
      routes this phase built: enqueue into workspace A's session while
      authenticated as workspace B. M4 shipped exactly this defect once and it
      was caught only live. The daemon routes' half was proved by
      [T-M12-06](../M12/T-M12-06-verification.md); this is the browser half,
      which is new.

## D — Needs something that doesn't exist yet

**Needs a second paired machine.** Skip and record.

- [ ] Spec edge case 3 — either of two online machines may answer a Free
      session, and the owner neither knows nor cares which did

## E — Regression surface

- [ ] `pnpm typecheck` and `pnpm test` green across `packages/shared`,
      `packages/core`, `packages/ui`, and `apps/web`
- [ ] The Vercel preview builds

## On completion

- [ ] Tick 18.7–18.11 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark M13 complete
- [ ] Update the phase [`README.md`](README.md) status line and task table
- [ ] Update the plan's **Status** row
      ([`../../plans/2026-08-23-chat-message-sending.md`](../../plans/2026-08-23-chat-message-sending.md))
      to name M14 as next. It cannot read "✅ Completed" while M14 and M15 are
      unbuilt.
- [ ] Knowledge Center pass confirmed landed (T-M13-04), including the four
      global-claim pages
- [ ] **Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** with what breaks if the
      assumption is wrong and what concretely closes it. If `G-31`'s
      credentials problem recurred, that is an update to `G-31`, not a new
      entry.

## Result

<!-- What was actually run, and what it found. Name the evidence: what was
     clicked, what was observed, which prompts, which machine. "Verified" is
     not a result. -->
