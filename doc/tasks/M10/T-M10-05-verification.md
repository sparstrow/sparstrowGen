# T-M10-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M10 in place |
| **Depends on** | T-M10-01 … T-M10-04 |
| **Blocks** | M11 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Walk US2's eleven scenarios in a browser, on two accounts: one created fresh
during this pass, and one that predates the guide.

**What this pass may not be able to reach, said up front:**

- **A browser that composites frames** — `G-12`, `G-13`, `G-16`. If that has
  not changed, section A produces a `KnownGaps.md` entry rather than ticks.
  `setupSteps()` is a pure function precisely so section D stays provable
  either way; do not let its green tests stand in for a rendered guide.
- **A pre-existing account** for scenario 9. The owner's own account is the one
  that predates the guide — using it is the point, and it cannot be
  manufactured. If it is unavailable, say so rather than simulating it by
  resetting a slug.
- **A machine to pair** for scenario 3. Local core against `localhost:3000` is
  enough here; staging is M11's job.

## A — The acceptance scenarios

Two accounts. **Account A** is created fresh during this pass; **account B** is
the owner's existing one. Say which account each assertion was run on.

- [ ] **1** (A) — sign up, land in the app, and the dashboard shows the setup
      card naming the next step. Not an empty grid.
- [ ] **2** (A) — complete one step, sign out, sign back in. The done step reads
      done and the guide points at the next.
- [ ] **3** (A) — with the workspace named, pair a machine **from `/machines`**,
      then open `/setup`. The machine step reads done. Confirm no stored flag
      exists: nothing was written to make this true.
- [ ] **4** (A) — complete all three. The dashboard card is **gone**; `/setup`
      still loads and says setup is complete.
- [ ] **5** (A) — force a step into `unknown` (block `/api/v1/workspace` in
      devtools, or sign out in another tab). That step says it could not be
      checked and offers a retry; the other two remain accurate.
- [ ] **6** (A) — from a fresh account with nothing done, go straight to the
      machine step and expand it. Nothing is disabled; nothing blocks.
- [ ] **7** (A) — fill in the profile **from inside the guide**: upload an
      avatar, type a name, type an about-you. The step flips to done **on the
      name alone** — confirm by typing only the name first, before touching the
      other two.
- [ ] **8** (A) — fill in the workspace from inside the guide: logo, name,
      description, context. Same rule — the name alone completes it. The slug
      appears, read-only, and is derived from the name.
- [ ] **9** (A) — **before touching anything**, look at both forms on the fresh
      account. Every field is empty. The name fields do **not** contain
      `sriharicoder` or any other email-derived string, and the long fields show
      placeholders rather than values. Then confirm in the database that saving
      an unrelated field did not persist a placeholder as a value.
- [ ] **10** (A) — the machine step states that `sparstrow` needs a checkout of
      this repository today, and does not imply a command that can be installed.
- [ ] **11** (B) — open `/setup` on the pre-existing account. Steps reflect what
      that account has actually done. Its profile and workspace names were
      cleared by M9's cleanup, so both read **not done** — that is correct, not
      a bug. Fill them in and confirm they stick.
- [ ] **Independent test** — from account A's signup, reach a paired working
      machine using only what the guide says. No source, no docs, no asking.
- [ ] Browser console clean throughout

## A2 — The four states

**`/setup`:**

- [ ] **Populated** — three steps with correct states
- [ ] **Empty** — n/a by design; instead confirm the *fullest* case (a fresh
      account, everything `todo`) renders correctly and reads as an invitation
- [ ] **Loading** — skeletons keep the step list's shape; no reflow when the
      three queries resolve
- [ ] **Error** — a failed query renders `unknown` on that step with a retry
      that refetches only that query. Force it; do not reason about it

**Dashboard setup card:**

- [ ] **Populated** — progress count and current step correct
- [ ] **Loading** — same-height skeleton; the dashboard does **not** jump
- [ ] **Complete** — the card is absent
- [ ] **Error** — the card is absent, and the dashboard is otherwise unaffected

**Both setup forms, in both variants:**

- [ ] Populated / empty / loading / error, in **both** `variant="card"` and
      `variant="inline"`
- [ ] The error state **retains the typed value**
- [ ] Enter saves a single-line field; Escape reverts it; Enter in a textarea
      inserts a newline rather than saving
- [ ] Saving one field does **not** blank the others — check the row afterwards,
      not just the screen
- [ ] The slug renders read-only and cannot be focused into and edited
- [ ] Counters appear near the limit on about-you and context, and the fields
      stop at their maximum
- [ ] An avatar and a logo upload and render (or, if `T-M9-04` was cut, neither
      control is present — **no disabled control, no "coming soon"**)
- [ ] Light and dark themes; visible focus; nothing scrolls sideways at 375px

## B — What must NOT have changed

- [ ] The dashboard's stat grid, attention queue, PR queue and recent-runs
      table all render as before
- [ ] Settings → Account → Profile still shows email, provider, user id and the
      sign-out button alongside the new editable fields — the conversion added,
      it did not replace
- [ ] Settings → Workspace → General renders correctly with the workspace form
      **added** and M8's Machines card **removed**
- [ ] The **desktop build**: sidebar still reads `"Sparstrowgen"`, Settings →
      Account → Profile still shows its local single-user card, no `/setup`
      route exists, nothing errors from the absent workspace and profile queries
- [ ] Sign-out, account deletion and the bootstrap path for a brand-new account
      all still work

## C — The two that prove the design

- [ ] **No stored flag anywhere.** Grep the schema, the migrations and the
      handlers for anything resembling `onboarding`, `setup_complete`,
      `has_seen`. Zero matches. Scenarios 3 and 11 are both consequences of
      that; a match means the design was quietly abandoned mid-build.
- [ ] **No name heuristic anywhere.** Grep `packages/ui/src` and
      `apps/web/src` for `split("@")` and `split_part`. The only surviving uses
      must be unrelated to naming. Spec decision 6 removed the guess; a match
      here means it came back in a new place, and scenario 9 would eventually
      fail because of it.

## D — Provable without a browser

- [ ] `pnpm --filter @sparstrow/ui test` — every `setupSteps()` case
- [ ] `pnpm --filter web build` lists `/setup`
- [ ] `packages/ui/src/router.tsx` has no `/setup` route

## E — Regression surface

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r test` green, count recorded in the Result
- [ ] `pnpm --filter web build` succeeds

## On completion

- [ ] Tick 12.1–12.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark Band 12 complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's **Status** row (M11 next)
- [ ] **Knowledge Center pass (AGENTS.md §3.2).** This phase changes what a new
      user is told the app is. `first-run-setup.md` is the article it most
      directly falsifies; `what-is-sparstrowgen.md`, `limitations.md` and
      `providers-and-execution-modes.md` are re-read because a phase can
      falsify a page it never opened. Bump each edited article's `updated:`
      frontmatter
- [ ] Every unreached assertion written into
      [`../../KnownGaps.md`](../../KnownGaps.md) with what breaks if the
      assumption is wrong and what closes it

## Result

<!-- Which accounts, which host, which browser, the test count, what was
     clicked, what was observed. Name the evidence. -->
