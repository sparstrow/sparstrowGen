# T-AM3-02 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM3 in place |
| **Depends on** | T-AM3-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] **US2 scenario 1** — three turns that each produced a file show three
      groups, newest first, each labelled with the request that produced it
- [ ] **US2 scenario 2** — a conversation that has produced nothing shows the
      "files your agent makes … collect here" copy, not "Nothing to preview"
- [ ] **US2 scenario 3** — on a phone-width viewport, the list is reachable and
      usable. Use `resize_window` preset `mobile` **and reload**, so any
      load-time gate re-runs
- [ ] **US2 scenario 4** — an item whose object was deleted says so on its own
      row; every other row still opens
- [ ] **Independent test** — click an entry; it opens the same enlarged view an
      inline item opens
- [ ] Console clean on load and on opening the sheet

## A2 — The four states

- [ ] **Populated** — items across at least three turns
- [ ] **Empty** — decision 4's copy, on both the desktop panel and the sheet
- [ ] **Loading** — skeleton rows, no layout jump when real rows arrive
- [ ] **Error** — break the read (revoke, or point at a bad session id); the
      panel says the list could not be loaded and the retry works
- [ ] Both light and dark themes
- [ ] Paper and Mono surfaces
- [ ] Keyboard: the sheet trigger is reachable, the list is traversable, Escape
      closes the sheet and focus returns to the trigger
- [ ] Nothing scrolls sideways at 375px

## B — What must NOT have changed

- [ ] A **project** chat still shows its project name and the "open a terminal"
      link — phase decision 2, and the regression most likely to slip through
- [ ] The conversation transcript itself is unchanged: `T-AM2-02`'s inline strip
      still renders, and closing the preview panel still works as before
- [ ] A conversation that produced nothing still renders the transcript exactly
      as `development` does (SC-005 again — the panel changed, the reply did not)
- [ ] Session rename, archive and delete from band 26 all still work

## C — What can be verified today

- [ ] **SC-004** — seed a conversation with items across ten or more turns;
      find a specific named one from the panel **without scrolling the
      transcript**. Time it if it helps; the assertion is that the transcript is
      never touched
- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `agent-browser` screenshots at desktop and mobile widths

## D — SC-003, and what it costs to reach

**Needs a stopped daemon, and ideally a second device.**

- [ ] Stop the daemon on the producing machine entirely (not just disconnect)
- [ ] Sign in from a different browser profile as the same owner
- [ ] Every item the conversation produced still loads
- [ ] Record which form was run — real second device, or second browser
      profile — and open a `KnownGaps.md` entry if only the substitute was
      possible

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `apps/web` builds

## On completion

- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row
- [ ] Knowledge Center: `chat-and-inbox.md` gains the panel, with its
      `updated:` date bumped and its `## Known Limitations & Boundaries`
      extended for the desktop-vs-sheet difference
- [ ] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)**

> The queue flip happens once, in the commit that lands the band on
> `development` — not here.

## Result

<!-- What was actually run, and what it found. -->
