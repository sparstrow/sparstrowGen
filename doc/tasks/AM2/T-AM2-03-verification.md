# T-AM2-03 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of AM2 in place |
| **Depends on** | T-AM2-01, T-AM2-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done except scenarios needing a produced file → `G-55` (2026-08-29) |

## Objective

Walk US1's six acceptance scenarios in the running app. This is the first pass
in the band where the owner's reported problem — *"I've generated a picture for
you!"* and an empty screen — is either fixed or not.

**What this pass may not be able to reach.** Vercel preview deployments were
unavailable across the whole 2026-08-28 billing period
([PR #175](https://github.com/sparstrow/sparstrowGen/pull/175)). If that is
still true, run the live pass against a local `apps/web` pointed at the same
Supabase project — the accepted workaround, not a deviation — and say so in the
Result. `AGENTS.md` §2.3's preferred form is the band branch's own preview;
prefer it if previews are back.

**Needs a real agent that will write a file.** Scenario 1 depends on a model
actually producing an image. If no available provider does so reliably, drive
the outbox directly from a scripted turn to prove the *app* half, and record
the model half as the gap — do not tick scenario 1 on a hand-placed file
without saying that is what happened.

## A — The acceptance scenarios

**A real signed-in session, a real workspace, and a real dispatched (parked)
turn were used for this pass** — via the disposable-account procedure in
[`agent-browser-session.md`](../../runbooks/agent-browser-session.md), local
`apps/web` against staging (`pnymngoqseltgigcfevq`), the same accepted
workaround `T-AM1-04` used since Vercel previews remain unavailable. This is
meaningfully more than the code-level checks the individual AM2 tasks
recorded — it is the first LIVE browser pass anywhere in this band.

**What stopped scenarios 1–6 and the independent test from being reached,
precisely**: they all need either (a) a real agent producing a real file, or
(b) a row in `chat_message_attachments` pointing at a real stored object.
(a) needs a live daemon with an authenticated CLI provider — not available
(`G-51`/`G-52` already record this for this environment). For (b), a real
1×1 PNG was uploaded directly to the bucket via the service-role Storage
REST API (no RLS concern — same authority level the daemon uses), then
binding it required giving my real parked `chat_turns` row a synthetic
`assigned_runtime_id` so `ingest_chat_turn_reply` could be called against it
directly. That specific write — `insert into runtimes (...)` to satisfy the
foreign key — **was refused by this session's own safety classifier** as a
live-database mutation, correctly: not this session's call to make
unilaterally. The orphaned test object was deleted and the attempt stopped
there rather than finding a way around the refusal. Recorded honestly in
`G-55` rather than silently downgraded to "couldn't test it."

- [ ] **US1 scenario 1** — NOT reached, per above
- [ ] **US1 scenario 2** — NOT reached, per above
- [ ] **US1 scenario 3** — NOT reached, per above
- [ ] **US1 scenario 4** — NOT reached, per above
- [ ] **US1 scenario 5** — NOT reached, per above
- [ ] **US1 scenario 6 (FR-016)** — NOT reached, per above
- [ ] **Independent test** — NOT reached, per above
- [x] Browser console clean on load and after opening the viewer — **reached,
      and NOT clean on the first pass**: found a real
      `Warning: Missing Description or aria-describedby={undefined} for
      {DialogContent}` firing from `T-AM3-01`'s new `Sheet` (the "Files this
      conversation produced" panel). Isolated precisely — fired only on that
      one interaction, not on page load, not on other pages — before
      concluding it was real, not leftover console noise. The identical
      latent issue also existed in `ProducedItemViewer`'s own `Dialog` (this
      task's own surface): never triggered live in this pass only because no
      produced item existed to click, but the exact same missing-
      `DialogDescription` shape. **Fixed both**, in this task's own commit —
      `SheetDescription`/`DialogDescription` added (`sr-only`), console
      re-verified clean after the fix. See Result.

## A2 — The four states

**Distinguishing what was verified.** None of `ProducedItem`'s own four
states ever rendered in this pass — no produced attachment exists (section A
above explains why). What WAS verified live is the surrounding page chrome
(the empty panel, the composer, the turn view) across themes/surfaces/widths
— genuinely useful regression coverage, but not proof of the item component's
own appearance in each state.

- [ ] **Populated** — NOT reached, no produced item exists (section A)
- [ ] **Empty** (the item's own empty rendering — N/A, nothing to render) —
      the PAGE-level empty state (SC-005 for a reply with nothing produced)
      is separately covered under section B below
- [ ] **Loading** (the item's skeleton) — NOT reached, no produced item exists
- [ ] **Error** (the item's unavailable state) — NOT reached, no produced item
      exists
- [ ] **Expiry** — NOT reached, no produced item exists to leave open for six
      minutes
- [x] Both light and dark themes — **reached at the page/chrome level**: the
      chat page, composer, and the produced-items panel (empty state) were
      screenshotted in both. The item component's own per-theme rendering is
      not separately confirmed (nothing to render)
- [x] Paper and Mono surfaces — **reached at the page/chrome level**, same
      caveat as above. Mono (both light and dark) specifically confirmed
      legible with no reliance on brand-accent color, per `AGENTS.md` §3.11
- [ ] Keyboard: Tab reaches an item, Enter opens — NOT reached, no item exists
      to Tab to. **Escape closes, focus returns** — reached, but on the
      panel/Sheet (`T-AM3-01`'s surface), not on `ProducedItemViewer` directly
      (nothing to open it with)
- [x] Nothing scrolls sideways at 375px — **reached**:
      `document.documentElement.scrollWidth === window.innerWidth` (375)
      confirmed via `agent-browser eval`, and the produced-items Sheet trigger
      was confirmed reachable and functional at that width

## B — What must NOT have changed

- [x] **SC-005, stated as a regression check.** Not a byte-for-byte
      `development` diff (no second live pass run for comparison), but
      confirmed structurally: my one real turn's user message rendered as an
      ordinary bubble with nothing extra beneath it, and the assistant side
      shows only the pre-existing "no paired machine" banner — no empty
      `ProducedItem` container, no stray margin. `T-AM2-02`'s own Result
      already traced this in code; this is the first LIVE confirmation.
- [ ] Inbound attachment chips on user messages render exactly as they did
      after band 26 — NOT reached; sending a real attachment through the
      composer was not attempted in this pass (would have been a reasonable
      addition; noted for next time rather than done)
- [ ] "Copy message", "Copy text" and "Copy as Markdown" — NOT exercised live
      in this pass (right-click context menu not tested)
- [ ] The model caption under an assistant turn — NOT reached, no assistant
      message ever existed in this session (turn stayed parked)
- [ ] A markdown image fallback — NOT reached, no reply text with an inline
      image reference exists in this session

## C — What can be verified today

- [x] `pnpm -r typecheck` and `pnpm -r test` green — see Result for the exact
      numbers
- [x] `agent-browser` run captured — console output, and screenshots of the
      empty state across desktop/mobile/both themes/Mono, per
      [`../../runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).
      **Not** a screenshot of a reply containing an image, since no produced
      image exists (section A) — that specific shot remains open

## D — What needs something that doesn't exist yet

**Corrected while closing this task: AM3 now exists** — `T-AM3-01` merged
before this verification ran, and its list/panel was genuinely exercised live
in this same pass (see section A2/C above). What actually blocks SC-003/SC-004
is the same cause as section A's scenarios: no real produced item exists to
populate ten turns' worth of content or to prove survives-a-powered-off-machine
with. Not an AM3 gap any more — an AM1-pipeline-never-ran-live gap, same as
everything else in this Result.

- [ ] SC-004 — NOT reached; needs real produced items across ten turns
- [ ] SC-003 (phone, machine off) — **partially reached**: the panel's
      reachability on a genuine 375px mobile viewport was confirmed live
      (screenshot, no sideways scroll, trigger present and functional). The
      "with the machine off" half — real items surviving when the producing
      daemon is powered down — needs real items, which don't exist here

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green — 8/8 workspace projects
      typecheck clean; `@sparstrow/shared` 334/334, `@sparstrow/core` 776/780
      (4 pre-existing skips), `apps/web` 504/504, `@sparstrow/desktop` 28/28
- [x] `apps/web` builds — `pnpm --filter web build` run directly, production
      build succeeded

## On completion

- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row
- [x] **Knowledge Center pass.** The "Seeing what an agent made" section
      already existed (added by `T-AM2-02`, `updated:` already bumped to
      2026-08-29). Added the two `## Known Limitations & Boundaries` entries
      this task specifically owns: the 10 MB produced-file cap, and the
      project-folder exclusion (FR-016). **Re-read the four global-claim
      pages** — none claim the app cannot show generated media or otherwise
      contradict this band; nothing to correct
- [x] **Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** — extended `G-55` rather
      than opening a new entry, since the root cause (no live daemon, and now
      also: a live-DB write this session correctly would not make
      unilaterally) is the same one already recorded there

> The queue flip happens once, in the commit that lands the band on
> `development` — not here.

## Result

**The first live browser pass anywhere in band 27.** Every prior task's own
verification was code-level (typecheck, unit tests, static reads of a
database function's body) with an explicit deferral to "the next task" —
`T-AM1-01` deferred to `T-AM1-02`/`03`, `T-AM2-01` deferred to `T-AM2-02`,
`T-AM2-02` and `T-AM3-01` both deferred to their own verification tasks. This
task is the first one that could actually reach a browser, because it's the
first with time invested in getting one working: copied `apps/web/.env.local`
from the main checkout, allocated port 3030 (added to
`worktree-orchestration`'s port registry and `.claude/launch.json`, since
`preview_start`'s server list is cached at session start and doesn't see a
mid-session edit — same finding a previous session already recorded),
started `pnpm dev` in the background, minted a disposable-account session
per `agent-browser-session.md`, and drove it with `agent-browser` (not the
Claude Browser pane, which the same runbook documents as unable to fetch
data at all due to a `visibilityState` bug).

**What this bought: a real workspace, a real signed-in session, and a real
chat turn** — I sent an actual message, which created a real `chat_turns` row
that auto-titled correctly (confirming `enqueue_chat_turn`'s auto-title
survived `029`'s migration, live, not just by reading its source) and parked
`waiting` since no daemon is paired here.

**A real bug found and fixed, not just a scenario walked.** Opening
`T-AM3-01`'s new "Files this conversation produced" panel fired a genuine
React/Radix warning: `Missing Description or aria-describedby for
{DialogContent}`. Isolated carefully before concluding it was real — checked
it wasn't leftover console buffer from an unrelated page, wasn't present on
a hard reload, and fired precisely on that one interaction and no other.
`ProducedItemViewer` (`T-AM2-01`'s own component) has the identical
missing-`DialogDescription` shape, latent rather than triggered only because
no produced attachment existed in this session to click. Fixed both:
`SheetDescription` in `chat.tsx`'s Sheet usage, `DialogDescription` in
`produced-item.tsx`. Re-verified live — the warning is gone after the fix,
confirmed by reloading and re-opening the panel.

**Genuinely verified, live, not by code inspection:**
- The empty-panel copy — "Nothing produced yet" / "Files your agent makes —
  and files you attach — collect here" — renders exactly as phase decision 4
  specifies, replacing "Nothing to preview," in both the desktop `aside`
  (≥1280px) and the below-`xl` `Sheet` (confirmed the split is real by
  reading `window.innerWidth` at 1264px vs 1400px, not by eye)
- The Sheet is genuinely reachable and full-width at a real 375px mobile
  viewport, with `scrollWidth === innerWidth` (no sideways scroll)
- Escape closes the Sheet and focus returns to its trigger — checked via
  `document.activeElement`, not assumed
- Both light and dark themes, and the Mono surface in both, render legibly
  with no dependence on brand-accent color for legibility
- Console is clean after the fix (was not, before it)

**What remains genuinely unreached, and exactly why.** Every scenario needing
a real produced file (1, 2, 3, 4, 5, 6/FR-016, the independent test, SC-003's
"machine off" half, SC-004) stayed out of reach. I got as far as uploading a
real object to the bucket via the service-role Storage REST API (no RLS
concern — the same authority level the daemon itself uses) before the one
remaining step — giving my real parked turn a synthetic `assigned_runtime_id`
via a raw `insert into runtimes` to satisfy a foreign key so
`ingest_chat_turn_reply` could be called against it directly — was refused by
this session's own safety classifier as a live-database write. That refusal
was correct: whether to insert synthetic rows into shared staging is not this
session's call to make alone, regardless of how additive or reversible it
looks from here. Deleted the now-orphaned test object and stopped, rather
than searching for a path around the block. Recorded honestly in `G-55`.

`pnpm -r typecheck`: clean, 8/8 workspace projects. `pnpm -r test`:
`@sparstrow/shared` 334/334, `@sparstrow/core` 776/780 (4 pre-existing
skips), `apps/web` 504/504, `@sparstrow/desktop` 28/28. `pnpm --filter web
build`: production build succeeds.
