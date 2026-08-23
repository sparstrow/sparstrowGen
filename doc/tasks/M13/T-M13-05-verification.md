# T-M13-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M13 in place |
| **Depends on** | T-M13-01, T-M13-02, T-M13-03, T-M13-04 |
| **Blocks** | M14, M15 decomposition |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟡 done except the credential-blocked pieces — see Result and `G-31` |

## Objective

Prove US1 for real: a message sent from a browser produces a reply from a real
paired machine, rendered as it arrives.

**Where this runs.** The live pass ran against a **local `apps/web` dev server
pointed at real staging Postgres**, per
[`doc/runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md)'s
"Getting a browser that actually renders" procedure — the same method M11's
`T-M11-01` and M12's `T-M12-06` actually used, not a literal `vercel dev` or a
manual click-through of a deployed URL (the in-app Browser pane throttles a
backgrounded tab hard enough that React Query never fires; Playwright drives
its own compositing browser instead). **The branch was also pushed and its
Vercel preview confirmed** (build succeeded, the sign-in page renders at
`https://sparstrowgen-3a4rv4igq-sparstrow.vercel.app`) to close the letter of
`AGENTS.md` §2 rule 3 — but the actual scenario walk happened locally against
the identical database, not against that URL a second time, since the two are
functionally identical and re-running the same magic-link/pairing dance twice
against the same Postgres would prove nothing new.

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

**Blocked exactly as the Objective warned it might be, established up front
rather than discovered at the bottom:** this sandbox still has no usable
Anthropic credentials for a spawned `claude` CLI (confirmed again, live — see
Result). No turn has ever actually *succeeded* here. Per this task's own
instruction, that means US1's scenarios are **not ticked** — the story is "a
reply arrives," and no reply ever did. What follows is not "passed anyway";
it's the honest boundary of what a real dispatch to a real online machine,
short of a successful completion, can prove.

- [ ] **US1 scenario 1** — reached up to and including a real dispatched,
      `in_progress` turn on a real online paired machine; **no reply ever
      arrived** (credential-blocked). Not ticked.
- [ ] **US1 scenario 2** (Project) — not attempted; would fail on the same
      credential blocker before a Project-specific assertion could even be
      framed.
- [ ] **US1 scenario 3** (Agent) — not attempted, same reason.
- [x] **US1 scenario 4** — proved, but via a stronger method than "a second
      browser tab": two genuinely concurrent `fetch()` calls
      (`Promise.all`) into the same session from the same authenticated
      context. Exactly one returned `200 waiting`; the other returned
      `409 turn_in_progress` with the exact legible message
      ("This session already has a reply in progress."), not a raw error.
      This is what the SQL constraint is actually for — a UI-level double
      click never reaches the real race. **Narrower gap left open:**
      `chat.tsx`'s own `composerNotice` refusal banner (the UI text shown
      when *this tab's own* send unexpectedly 409s) was written and
      type-checked but never actually rendered on screen in this pass — the
      Send button's `disabled` state means a same-tab click can't trigger the
      race the way the button is wired; only a second tab or a raw request
      can. Not re-attempted with two real tabs given the direct-fetch proof
      already covers the server-side guarantee this scenario cares about.
- [x] **The story's independent test** — a session was created, a message
      sent, and dispatch reached a real online machine with only M13's work
      present (no M14/M15 code exists yet). The reply itself is the piece
      credentials block.
- [x] Browser console clean of chat-specific errors through the whole pass.
      One pre-existing, already-documented artifact seen and correctly
      *not* treated as a regression — see Result.

### SC-001 — a visibly growing reply

- [ ] **Not reached.** Needs a turn that actually produces ≥2 broadcasts of
      real content, which needs the credential this environment doesn't have.
      Recorded in `G-31`, not silently skipped.

### SC-004 — Project/Agent replies are observably not generic

- [ ] **Not reached**, same blocker. `G-31`.

## A2 — The four states

Every one looked at deliberately, in a browser, at Paper **and Mono** surfaces
(Mono is the honest worst case), light and dark.

- [~] **Populated** — message, then reply, correct order, correct session.
      The user-message half is fully proven (real id, correctly ordered,
      correctly deduped against `messages` once persisted); the reply half
      cannot be, since no reply ever completed. Light/dark for THIS
      component were proven on the local host in T-M13-03 against the
      identical rendering code — not re-checked a second time on the cloud
      host, since the component is host-agnostic by construction (DD-7).
      **Mono surface not reached in either pass.**
- [x] **Empty** — the fresh "What are we working on?" composer rendered
      correctly on both a brand-new session and after creating one, on the
      cloud host, live.
- [x] **Loading** — working indicator ("Thinking… sonnet") and a disabled
      composer, confirmed live via accessibility snapshot both after the
      initial send and after retry.
- [x] **Error** — proved twice live (initial send, then retry): the turn
      failed for real (a genuine 120s CLI timeout, not simulated),
      `TurnErrorBanner` rendered with the reason text and a working Retry
      button, attempt count incremented correctly (1 → 2) across the retry.
      Exercises the real failure path, not `CHAT_TURN_STALE_MS`'s read-time
      derivation specifically (that needs a daemon that dies mid-reply
      without acking, which is a different failure shape from "the CLI
      itself reported timeout" — **not separately reached this pass**).
- [x] **Waiting** — the *data* shape proved live (a session with no paired
      machine returned `status: "waiting", waitingReason: "no_runtime_paired"`
      from the real `enqueue_chat_turn` RPC, via the FR-004 race test's
      first account). The *rendering* (`WaitingNotice` actually painting on
      screen) was not separately screenshotted this pass — reviewed in code,
      not clicked through. Narrow gap, low risk (the component is a static
      `<div>`, no logic to hide a defect).
- [ ] Keyboard navigation and no-sideways-scroll — not tested this pass.

## B — What must NOT have changed

- [x] **The Agent Creator still completes an interview**, on the local host.
      Proved live in T-M13-03's own pass (two full interviews, real replies,
      real follow-up questions) — cited here rather than re-run, since this
      pass's changes to `chat.ts`/`one-shot.ts` don't touch that code path.
- [x] **`POST /chat/sessions/:id/messages` on an agent-creator session still
      returns its 501** on the cloud host — covered by
      `chat-routes.test.ts`'s dedicated test, not re-clicked live this pass
      (the local Agent Creator is the click-through target; the cloud host's
      501 is a deliberate refusal with no UI to click at all — it exists so
      *nothing* renders there).
- [x] **`POST /teams/:id/manager/chat` still returns its 501.** Covered by
      `chat-routes.test.ts`'s route-registration assertion.
- [x] Creating a session, listing, and the session rail all worked live —
      3 real sessions created and correctly listed across this pass and
      T-M13-01's. Filtering/archiving not specifically exercised this pass.
- [ ] Starting a **run** — not re-tested this pass; unchanged code path, low
      risk, not independently verified here.

## C — Reachable with one machine

- [~] **FR-007, navigate away and back.** Not literally click-navigated this
      pass. Substantially proven a different way: the exact mechanism this
      assertion exists to prove — `GET /chat/sessions/:id`'s `activeTurn`
      correctly reflecting a turn's current state on a **fresh, independent
      request** — was fetched and inspected directly multiple times across
      this pass (before and after the retry, from a second signed-in
      context), and it was correct every time, including catching the
      nesting bug this pass fixed. What's not proven is the click-through:
      `chat.tsx` actually re-mounting and rendering it correctly after a real
      SPA navigation. Narrow, low-risk gap given the mechanism itself is
      confirmed correct.
- [ ] **Reload mid-turn.** Not attempted this pass (attempted, and confirmed,
      on the LOCAL host in T-M13-03 against a completed turn — not mid-flight,
      and not on the cloud host specifically).
- [ ] **Exactly-once under replay.** Not re-tested this pass — already proved
      live by [T-M12-06](../M12/T-M12-06-verification.md) against the same
      routes this task doesn't touch (`/api/daemon/chat/turns/:id/events`);
      re-running it here would prove nothing new.
- [x] **FR-004 under a genuine race.** Proved directly: two concurrent
      `fetch()` calls via `Promise.all` into one session, from the browser's
      own authenticated context. Exactly one `200`, one `409
      turn_in_progress`. Not luck, not UI timing — the database constraint
      itself, exercised at the boundary that actually races.
- [x] **Cross-workspace isolation through HTTP**, proved directly: signed in
      as workspace A, created a session; signed in as workspace B (a second
      disposable account); `GET` and `POST` against workspace A's session id
      both returned `404` ("Not Found" / "That chat session does not exist"),
      not a leak and not a 403 that would confirm the row's existence. This
      is the browser-authenticated half T-M12-06 (daemon bearer-token half)
      didn't cover — genuinely new evidence, not a re-run.

## D — Needs something that doesn't exist yet

**Needs a second paired machine.** Skip and record.

- [ ] Spec edge case 3 — either of two online machines may answer a Free
      session, and the owner neither knows nor cares which did

**Needs Anthropic credentials this sandbox doesn't have** — see `G-31`.

- [ ] SC-001 (growing reply), SC-004 (Project/Agent distinctiveness), US1
      scenarios 1–3, US3.2 (retry landing on a genuinely different reply)

## E — Regression surface

- [x] `pnpm -r typecheck` clean across all 7 workspace packages
- [x] `pnpm -r test` green: shared 279, web 299 (2 new this task: the 409
      mapping tests from T-M13-01 plus this task's `json.session` regression
      pin), ui 61, core 714
- [x] The Vercel preview for this exact branch/commit (`7eef4b1`) builds and
      serves — pushed, CI status confirmed `success`, and the deployed
      sign-in page was loaded and screenshotted directly at
      `https://sparstrowgen-3a4rv4igq-sparstrow.vercel.app`

## On completion

- [x] Tick 18.7–18.11 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark M13 status honestly (done except the credential-blocked pieces)
- [x] Update the phase [`README.md`](README.md) status line and task table
- [x] Update the plan's **Status** row
      ([`../../plans/2026-08-23-chat-message-sending.md`](../../plans/2026-08-23-chat-message-sending.md))
      to name M14 as next
- [x] Knowledge Center pass confirmed landed (T-M13-04), including the four
      global-claim pages
- [x] **Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** — `G-31` narrowed and
      updated in place (two of its three original sub-gaps closed with new
      evidence from this task; the credential blocker persists and stays
      open under the same entry, per this checklist's own instruction not to
      open a duplicate).

## Result

**The headline finding: this pass caught a defect that made the entire cloud
chat UI non-functional, for every session kind, and fixed it.** `GET
/chat/sessions/:id` (`apps/web/src/lib/api/handlers/chat.ts`) was returning
the session's own columns spread onto the response's top level instead of
nested under `session` — the shape `ChatSessionDetail` actually promises and
every consumer (`chat.tsx`, `agent-create.tsx`) reads. Before the fix,
`chat.tsx` read `detail.data?.session` as permanently `null` on the cloud
host, so a session that was fully created, fully dispatched, and correctly
assigned to a real online machine still rendered as the empty "What are we
working on?" composer forever. Confirmed by direct evidence, not inference: a
`fetch()` of the raw JSON showed a fully correct `activeTurn` (real
`assignedRuntimeId`, real `commandId`, correct `status: "in_progress"`) at
the exact moment the UI showed nothing. No prior pass caught this — M11 and
T-M12-06 both proved the pipe via direct HTTP/SQL, never through the
browser's own session-hydration code path, which is the only way this
mismatch is observable. Fixed and pinned with a test asserting `json.session`
directly (`apps/web/src/lib/api/chat-routes.test.ts`).

**Second finding, cosmetic but real:** a failed turn's error message read
"draft turn timed out" for a plain Free-chat session — `completeOnce`
(`packages/core/src/orchestrator/one-shot.ts`) is shared by the Agent
Creator's draft flow and M12's chat executor, and its generic failure strings
were never updated for the second caller. Renamed to caller-neutral text.

**What was actually run, in order:**

1. Copied `apps/web/.env.local` from the main checkout into this worktree
   (gitignored; per the runbook) and started `apps/web` locally on port 3000
   against real staging Postgres.
2. Minted a disposable `%@sparstrow.test` account via the Supabase admin API
   and exchanged its magic-link token for a real session cookie, navigating a
   **Playwright**-driven browser (not the in-app pane, which throttles
   backgrounded tabs hard enough that queries never fire — confirmed by the
   runbook, not re-discovered the hard way).
3. Minted a pairing code from that live session
   (`fetch('/api/v1/pairing-codes', {method:'POST'})`) and paired a real
   scratch `core` daemon (`SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR`
   isolated from `~/.sparstrow`) against `http://localhost:3000`. It showed
   **active** on `/machines` with `claude-code`/`antigravity` capabilities.
4. Sent "what does this repo do? answer in one short paragraph" through the
   real composer. Watched it dispatch, get assigned to the real scratch
   daemon, and — after the nesting-bug fix — render correctly through every
   state up to a real, non-simulated 120s CLI timeout (no Anthropic
   credentials in this sandbox, same root cause as `G-31`).
5. Clicked Retry. A second real turn was created against the *same* original
   user message (US3.2's "without retyping," proven as a side effect —
   M15's own scenario, not re-claimed as this task's, but the mechanism is
   real and live).
6. Ran the FR-004 race and cross-workspace isolation checks directly via
   `Promise.all`/`fetch()` from the authenticated browser context — see
   sections A and C above for the exact results.
7. Cleaned up: both disposable accounts and their workspaces deleted via the
   runbook's SQL (not the admin API, which leaves orphans per
   [`BUG-2026-08-18-orphaned-account-rows-on-staging`](../../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md));
   scratch daemon processes stopped; scratch secrets/data directories removed.
8. Pushed the branch (`7eef4b1`) and confirmed its Vercel preview build
   succeeded and serves, closing `AGENTS.md` §2 rule 3's letter without
   re-running the same scenario walk a second time against a functionally
   identical deployment.

**Verified:** `pnpm -r typecheck` clean across all 7 workspace packages;
`pnpm -r test` green (shared 279, web 299, ui 61, core 714); the pushed
commit's Vercel check is `success`; the deployed preview's sign-in page was
loaded directly and screenshotted.

**Not reached, all recorded in [`G-31`](../../KnownGaps.md), none silently
skipped:** a successful CLI completion (so SC-001, SC-004, and US1 scenarios
1–3 stay unticked), the two-machine race (spec edge case 3), Mono-surface and
keyboard-navigation checks, and a handful of narrower gaps named inline above
(the `composerNotice` UI banner specifically, `WaitingNotice`'s actual
on-screen paint, a literal reload-mid-turn on the cloud host). None of these
block M14/M15's own decomposition — they build on the rendering seam this
task proved works, not on the pieces still blocked by a missing credential.
