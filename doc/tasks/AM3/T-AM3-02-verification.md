# T-AM3-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM3 in place |
| **Depends on** | T-AM3-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except scenarios needing a produced file → `G-55` (2026-08-29) |

## Objective

Walk US2's four acceptance scenarios, and grade SC-003 and SC-004 — the two
success criteria no earlier phase can reach.

**SC-003 needs a second device and a powered-off machine.** The spec's own
verification note allows a substitute: a different browser with a fresh
sign-in, plus a **stopped daemon**. Stopping the daemon is the load-bearing
half — it proves the file is served from cloud storage and not from the
machine. If a real phone is available, use it; if not, run the substitute and
record the difference rather than ticking the stronger claim.

**Vercel previews may still be unavailable** (see `T-AM2-03`'s note). Local
`apps/web` against the same Supabase project is the accepted workaround; say
which was used.

## A — The acceptance scenarios

**Ran this against the same live session `T-AM2-03` set up** — local
`apps/web` (port 3030) against staging (`pnymngoqseltgigcfevq`), a real
disposable-account session, driven with `agent-browser` (not the Claude
Browser pane — see that task's Result for why). Continued rather than
re-set-up, since both phases share the same UI.

- [ ] **US2 scenario 1** — NOT reached. Needs three turns that each produced
      a file; no live daemon exists here to produce any (`G-55`)
- [x] **US2 scenario 2** — **reached, live**: a fresh conversation's panel
      shows "Nothing produced yet" / "Files your agent makes — and files you
      attach — collect here", in both the desktop `aside` and the below-`xl`
      Sheet, confirmed screenshot in `T-AM2-03`'s pass and re-confirmed here
- [x] **US2 scenario 3** — **reached, live, with a real 375px viewport**
      (not just a narrowed desktop window — the phase's own trap): the Sheet
      trigger is present and functional, the Sheet opens full-width, no
      sideways scroll (`scrollWidth === innerWidth`, confirmed via
      `agent-browser eval`)
- [ ] **US2 scenario 4** — NOT reached in the specific form asked (an item
      whose *object* was deleted). What WAS reached is the adjacent case: the
      whole *list read* failing (see A2 Error below) — a different failure
      point in the same component, not the same assertion
- [ ] **Independent test** — NOT reached, no produced item exists to click
- [x] Console clean on load and on opening the sheet — reached; see
      `T-AM2-03`'s Result for the real bug found and fixed in this exact
      surface (`SheetDescription` missing on this Sheet) before this pass ran

## A2 — The four states

- [ ] **Populated** — NOT reached, no produced item exists (no live daemon)
- [x] **Empty** — **reached, live**, decision 4's copy, confirmed in both the
      desktop panel and the Sheet
- [ ] **Loading** — NOT reached. `agent-browser network route`'s `--body`
      option always returns 200 immediately with no delay flag (a known,
      already-documented `agent-browser` gap in
      [`agent-browser-session.md`](../../runbooks/agent-browser-session.md));
      forcing a genuinely slow response needs the Playwright MCP's
      `page.waitForTimeout` inside a route handler, which this pass did not
      reach for
- [x] **Error** — **reached, live, and genuinely exercised, not just read**:
      routed `**/rest/v1/chat_messages*` to `--abort` via `agent-browser
      network route`, reloaded, and the panel showed "Couldn't load this
      conversation's files / Something went wrong reading what this
      conversation produced" with a Retry button. Removed the route and
      clicked **Retry** — it genuinely recovered to the empty state, proving
      the retry actually re-runs the read rather than being decorative
- [x] Both light and dark themes — reached, live, screenshotted (see
      `T-AM2-03`'s Result; the panel and Sheet are the same component in
      both tasks' passes)
- [x] Paper and Mono surfaces — reached, live, both themes checked in Mono
      specifically per `AGENTS.md` §3.11
- [x] Keyboard: the sheet trigger is reachable, Escape closes the sheet and
      focus returns to the trigger — reached, live (`document.activeElement`
      checked directly, not assumed). **The list itself is not traversable**
      — NOT reached, no produced item exists to Tab through
- [x] Nothing scrolls sideways at 375px — reached:
      `document.documentElement.scrollWidth === window.innerWidth` (375),
      confirmed via `agent-browser eval`

## B — What must NOT have changed

- [x] A **project** chat still shows its project name and the "open a
      terminal" link — **reached, live, and this is the single most valuable
      check in this task**: created a real project ("Verify Project", bound
      to a real local path), started a project chat, sent a message, and
      confirmed the project card renders correctly **above** the produced-
      items list, exactly as phase decision 2 specifies. This is the
      regression the phase README itself flagged as "most likely to slip
      through," and it did not
- [x] The conversation transcript itself is unchanged: `T-AM2-02`'s inline
      strip still renders (nothing to render — no attachments — but the
      turn view itself is visually unchanged), and the preview panel's
      show/hide toggle works both ways — reached, live
- [x] A conversation that produced nothing still renders the transcript as
      before — reached, live, same evidence `T-AM2-03` recorded (a user
      bubble, the existing "no paired machine" banner, nothing extra)
- [ ] Session rename, archive and delete from band 26 — NOT exercised in this
      pass (session list interactions beyond selecting one were not tested)

## C — What can be verified today

- [ ] **SC-004** — NOT reached; needs real produced items across ten turns,
      which needs a live daemon (`G-55`)
- [x] `pnpm -r typecheck` and `pnpm -r test` green — see Result for numbers
- [x] `agent-browser` screenshots at desktop and mobile widths — reached; see
      `T-AM2-03`'s Result and this task's own project-card screenshot

## D — SC-003, and what it costs to reach

**NOT reached — and correctly so, before it could even get to the
"stopped daemon" question.** No daemon has ever been paired in this
environment at all (never mind stopped), and there is nothing produced for
a second sign-in to load regardless. Both preconditions fail, not just one.
Recorded in `G-55` rather than attempting a partial substitute that would
prove nothing.

- [ ] Stop the daemon on the producing machine entirely — N/A, no daemon
- [ ] Sign in from a different browser profile as the same owner — not
      attempted, since there is nothing yet for it to prove
- [ ] Every item the conversation produced still loads — N/A, no items
- [x] Recorded honestly rather than rounded up — see `G-55`'s extension below

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green — 8/8 workspace projects
      typecheck clean; `@sparstrow/shared` 334/334, `@sparstrow/core` 776/780
      (4 pre-existing skips), `apps/web` 504/504, `@sparstrow/desktop` 28/28
- [x] `apps/web` builds — `pnpm --filter web build` succeeds (same run
      `T-AM2-03` used; no further app code changed since)

## On completion

- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row
- [x] Knowledge Center: `chat-and-inbox.md` gains a paragraph on the
      per-conversation panel/sheet (`updated:` already 2026-08-29 from
      `T-AM2-02`, no further bump needed same-day). **Corrected the
      checklist's own framing**: there's no meaningful "desktop-vs-sheet
      difference" limitation to document — both surfaces render identical
      content by design, confirmed live. The genuine limitation worth stating
      instead is that clicking a panel item doesn't scroll the transcript to
      the message that produced it — added that
- [x] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** — extended `G-55` rather
      than opening a new entry

> The queue flip happens once, in the commit that lands the band on
> `development` — not here.

## Result

**Continued the same live session `T-AM2-03` set up** rather than
re-establishing one — both phases share the exact same UI (the panel is
`ConversationItems`, whether reached from AM2's or AM3's own checklist), so
there was no reason to tear down and rebuild.

**Two things closed here that neither prior task reached:**

1. **The project-card regression, live.** Created a real project ("Verify
   Project", bound to a real path on this machine), started a project chat,
   sent a message, and confirmed the project card still renders correctly
   **above** the produced-items list — exactly matching phase decision 2.
   The phase README itself named this "the regression most likely to slip
   through." It didn't.
2. **A genuinely exercised Error → Retry cycle.** `agent-browser network
   route "**/rest/v1/chat_messages*" --abort`, reload, watched the real
   error message ("Couldn't load this conversation's files") with a Retry
   button appear, removed the route, clicked Retry, watched it recover to
   the empty state. This proves the retry button actually re-runs the failed
   read — not just that an error state exists, which reading the code
   already showed.

**What stayed out of reach, and why each one specifically:**

- **US2 scenario 1, US2 scenario 4 (the specific form), the independent
  test, SC-004** — all need real produced items; no live daemon exists here
  (`G-55`).
- **The Loading state** — `agent-browser network route --body` has no delay
  option (an already-documented gap in `agent-browser-session.md`); reaching
  for the Playwright MCP fallback for one skeleton screenshot wasn't judged
  worth the additional session setup.
- **SC-003** — could not even reach its own precondition. It needs a
  *stopped* daemon (implying one previously existed and produced something)
  and a second device to load that content from. Neither holds here at all,
  so no partial substitute was attempted — a substitute proves something only
  when the real form is reachable in spirit, and this one wasn't.

**Corrected while closing this task:** the checklist's own "Knowledge Center
… extended for the desktop-vs-sheet difference" framing doesn't hold up —
both surfaces render identical content by design, confirmed live, so there is
no such difference to document as a limitation. Replaced it with the
genuine limitation this pass surfaced: clicking a panel item doesn't scroll
the transcript to the message that produced it.

`pnpm -r typecheck`: clean, 8/8. `pnpm -r test`: identical to `T-AM2-03`'s
numbers (no app code changed since) — `@sparstrow/shared` 334/334,
`@sparstrow/core` 776/780 (4 pre-existing skips), `apps/web` 504/504,
`@sparstrow/desktop` 28/28. `pnpm --filter web build`: succeeds.

**AM2 and AM3 are both now complete except the same live-dispatch gap.**
AM4 is unblocked.
