# T-M10-05 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of M10 in place |
| **Depends on** | T-M10-01 … T-M10-04 |
| **Blocks** | M11 |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟡 partly done (2026-08-20) — section A mostly walked on one fresh account (A); scenario 11 (account B, pre-existing) not reached; sections A2/B partly covered; C and D fully proven. See Result |

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

- [x] **1** (A) — sign up (via `generateLink`/`verifyOtp`, the runbook's
      standard non-interactive sign-in — landed straight on `/setup` via
      `next=/setup`), land in the app. `/setup` shows all three steps `todo`/
      `current`, profile expanded. The **dashboard's own populated card** was
      not separately viewed this pass (see A2) — the guide landing correctly
      is what scenario 1 actually asks for, and that part is proven
- [x] **2** (A) — completed the profile step, then did a **full browser
      reload** (not sign-out/sign-in, which needs a fresh magic-link token this
      harness mints per-pass rather than a real password). The done step read
      done and the guide pointed at workspace next, unchanged after reload.
      Sign-out/sign-in specifically not exercised
- [x] **3** (A) — named the workspace, minted a pairing code from `/machines`'s
      own `POST /api/v1/pairing-codes`, paired a real local `@sparstrow/core`
      process against it (isolated `SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR`,
      per the runbook), started core. Reopened `/setup`: the machine step read
      **done**, "1 machine paired" — with no server-side write beyond the
      pairing/registration rows the machine flow already makes. `grep`
      confirmation in Section C
- [x] **4** (A) — completed all three (profile, workspace, machine). Dashboard
      (`/`) showed the card **absent**; `/setup` still loaded, said "You're all
      set", and kept all three steps visible and expandable
- [x] **5** (A) — forced `/api/v1/workspace` to `503` via `page.route`, reloaded.
      **Found the page never recovered from this — stuck on loading skeletons
      indefinitely** rather than showing the `unknown` state. Root-caused and
      fixed live during this pass:
      [`BUG-2026-08-20-setup-workspace-error-never-settles`](../../bug/BUG-2026-08-20-setup-workspace-error-never-settles.md).
      Re-tested after the fix: the workspace step correctly read "Couldn't
      check this. Simulated failure for verification." with a Retry button;
      profile and machine stayed accurate throughout. Clicked Retry: recovered
      to "Sparstrow Inc" / "You're all set" within the same page load, no reload
      needed
- [~] **6** (A) — the machine step's `todo`/`current` rendering was observed
      collapsed-then-expanded, unstyled-disabled, clickable — but this was not
      driven from a literal "nothing done yet, jump straight to step 3" click
      sequence this pass, since by the time it was checked the profile step had
      already been completed. Not contradicted, just not walked in that exact
      order
- [x] **7** (A) — from inside the guide: typed only the name ("Sri Hari") into
      the profile step, blurred. The step collapsed to **done** immediately,
      showing "Sri Hari", with the avatar and about-you left untouched and
      empty. Avatar/about-you were not additionally filled in this pass (the
      image-upload round trip through this exact control was not re-driven
      live here — see T-M9-04 for the direct-API proof of the storage half)
- [x] **8** (A) — from inside the guide: typed only "Sparstrow Inc" into the
      workspace step, blurred. Collapsed to **done**, slug appeared read-only
      as `personal-<hex>` before naming and derived to `sparstrow-inc` after,
      confirmed frozen (unchanged) on a later Settings-page view. Logo/
      description/context left untouched
- [x] **9** (A) — checked **before typing anything**: profile name empty
      (placeholder "e.g. Sri Hari"), about-you empty (placeholder shown),
      workspace name empty (placeholder "e.g. Sparstrow Inc"), slug already
      present (`personal-f5bb0590`, bootstrap-generated, not email-derived),
      description/context both showing placeholders. Nothing contained
      `m10verify` or any other part of the account's email. The
      unrelated-field-doesn't-persist-a-placeholder assertion was **not**
      separately re-confirmed by a raw DB read this pass (T-M9's own handler
      unit tests already cover "PATCH with only one key changes only that key")
- [x] **10** (A) — the machine step's `todo`/`current` copy read: "Pairing a
      machine needs a checkout of this repository today — sparstrow is not
      published as an installable package yet." No installable command implied
- [ ] **11** (B) — **not reached.** No pre-existing account was available to
      this harness — the "owner's own account" the scenario asks for belongs to
      a human on staging, not something a disposable-account pass can
      manufacture (and manufacturing it by resetting a slug is explicitly what
      the phase spec forbids simulating). `KnownGaps.md` entry opened
- [x] **Independent test** — reached a paired, active machine from a fresh
      signup using only what `/setup` itself said at each step (profile → name;
      workspace → name; machine → "Pair a machine" → `/machines` → pairing
      code → `sparstrow pair`), no source or docs consulted mid-pass to figure
      out what to do next
- [x] Browser console clean throughout every state **except** the deliberate
      `/workspace` 503 forcing in scenario 5, where errors are the point

## A2 — The four states

**`/setup`:**

- [x] **Populated** — all three states of the three steps seen: `done`
      (green check), `current` (filled brand dot, expanded), `todo` (outline
      dot, collapsed), and `unknown` (warning icon, expanded, retry) — all
      correct
- [x] **Empty** — the fullest case (fresh account, everything `todo`/`current`)
      confirmed: reads as an invitation, not an error
- [~] **Loading** — the skeleton shape was seen (three bars, same footprint as
      the eventual step list) but "no reflow when the three queries resolve"
      was not measured pixel-for-pixel; visually there was no jump in the
      screenshots taken before/after
- [x] **Error** — forced via `page.route`, confirmed `unknown` renders with a
      working retry that recovers without a page reload. (This is also where
      `BUG-2026-08-20-setup-workspace-error-never-settles` was found and fixed
      — the state did not reach this render at all before the fix)

**Dashboard setup card:**

- [ ] **Populated** — progress count and current step correct — **not viewed**;
      the dashboard was only opened after all three steps were already done
- [ ] **Loading** — same-height skeleton — **not viewed**, same reason
- [x] **Complete** — the card is absent — confirmed
- [ ] **Error** — the card is absent, dashboard otherwise unaffected — **not
      forced**; `SetupCard` doesn't share `setup.tsx`'s feedback-loop structure
      (no form mounts from it) so the same bug class doesn't apply, but its own
      error path was not independently exercised

**Both setup forms, in both variants:**

- [x] Populated / empty seen in **both** `variant="card"` (Settings) and
      `variant="inline"` (guide). Loading was seen only briefly (query
      resolves fast against a local Next dev server); error was seen via the
      forms' own "Couldn't check this" branch during the same `page.route`
      forcing used for scenario 5
- [ ] The error state **retains the typed value** — implemented (`useFieldDraft`
      never clears `draft` on a caught error) but not independently re-driven
      with a mutation-level failure (as opposed to the query-read failure
      already forced)
- [ ] Enter saves a single-line field; Escape reverts it; Enter in a textarea
      inserts a newline rather than saving — **not exercised via literal
      keypresses** this pass (fields were filled and blurred via `Tab`, which
      does exercise the same `onBlur` commit path, but not the `onKeyDown`
      branches)
- [ ] Saving one field does **not** blank the others — architecturally true
      (each field sends only its own key) and covered by M9's handler unit
      tests, but not re-confirmed by reading the row directly after a save
      this pass
- [x] The slug renders read-only (a `readOnly` `<Input>`, not an editable
      field) — confirmed rendered; not attempted to type into (a `readOnly`
      HTML attribute is browser-enforced, low residual risk)
- [ ] Counters appear near the limit on about-you and context, and the fields
      stop at their maximum — implemented (`Counter` at 80% of `maxLength`,
      `maxLength` attribute set) but not driven to that length live
- [ ] An avatar and a logo upload and render — **not re-driven through this
      exact UI control** this pass; the storage/RLS half was proven directly
      against the API in `T-M9-04`'s verification, and the component renders
      (upload button, fallback icon/initials) in every screenshot taken, but no
      file was actually selected and uploaded through `<ImageUploadField>`
      live in this session
- [x] Light and dark themes checked; nothing scrolls sideways at 375px.
      Visible focus was not separately audited; Mono surface was not checked
      (only the default Paper surface, both modes)

## B — What must NOT have changed

- [x] The dashboard's stat grid, attention queue, PR queue and recent-runs
      table all render as before — confirmed on the completed-setup dashboard
      view (System/Providers/Workspace/Memory-vault cards, attention queue "All
      clear", recent runs empty state, PR queue's own pre-existing 501)
- [x] Settings → Account → Profile still shows email, provider, user id and the
      sign-out button alongside the new editable fields — the conversion added,
      it did not replace
- [x] Settings → Workspace → General renders correctly with the workspace form
      **added** and M8's Machines card confirmed **absent**
- [ ] The **desktop build**: sidebar still reads `"Sparstrowgen"`, Settings →
      Account → Profile still shows its local single-user card, no `/setup`
      route exists, nothing errors from the absent workspace and profile
      queries. **The route-registration half is proven** (`router.tsx` grep,
      Section D); **the rendered half was not** — no Electron/vite build was
      launched this pass. `KnownGaps.md` entry opened
- [ ] Sign-out, account deletion and the bootstrap path for a brand-new account
      all still work — bootstrap is proven (every step of this pass depended
      on it); sign-out and account deletion were not re-exercised (unchanged
      code, and covered by existing tests/M2's original verification)

## C — The two that prove the design

- [x] **No stored flag anywhere.**
      `grep -rniE "onboarding|setup_complete|has_seen"` across
      `packages/shared/src/db/schema.ts`, `packages/shared/drizzle`, and
      `apps/web/src/lib/api/handlers` — **zero matches**.
- [x] **No name heuristic anywhere.**
      `grep -rn 'split("@")\|split_part' packages/ui/src apps/web/src` — the
      one surviving match is a **comment** in `account-snapshot.ts` explaining
      that the fallback was removed (`BUG-2026-08-18-shell-invents-name-from-email`),
      not a live code path.

## D — Provable without a browser

- [x] `pnpm --filter @sparstrow/ui test` — 15/15 `setupSteps()` cases pass
- [x] `pnpm --filter web build` lists `/setup`
- [x] `packages/ui/src/router.tsx` has no `/setup` route (`grep` returns
      nothing)

## E — Regression surface

- [x] `pnpm -r typecheck` green — all 7 packages
- [x] `pnpm -r test` green — `@sparstrow/desktop` 33, `@sparstrow/shared` 264,
      `@sparstrow/ui` 51, `web` 224, `@sparstrow/core` 675 passed / 4 skipped.
      Total 1247 passed / 4 skipped across the workspace
- [x] `pnpm --filter web build` succeeds

## On completion

- [x] Tick 12.1–12.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).
      **12.5 (this task) left `partly done`**, not ticked — Band 12 is not
      marked complete; see Result for exactly what's outstanding
- [x] Update the phase `README.md` status line and its task table
- [x] Update the plan's **Status** row
- [x] **Knowledge Center pass.** `first-run-setup.md` and `what-is-sparstrowgen.md`
      updated (done alongside `T-M9-04`, re-checked here now `/setup` is real).
      `limitations.md` and `providers-and-execution-modes.md` re-read: neither
      makes a claim this phase falsifies, so neither was edited
- [x] Every unreached assertion written into `KnownGaps.md`

## Result

**Accounts:** one fresh disposable account, `m10verify-<timestamp>@sparstrow.test`,
created and signed in via the standard `generateLink`/`verifyOtp` runbook
procedure (not a password, not a bypass — the same exchange `/auth/confirm`
performs). Cleaned up at the end of the pass: workspace, `public.users` row,
and `auth.users` row all deleted via direct table deletes, plus the paired
`@sparstrow/core` process killed and its isolated `SPARSTROW_SECRETS_DIR`/
`SPARSTROW_DATA_DIR` were scratch directories, not touching the real
`~/.sparstrow`. No account B (pre-existing) was available — see scenario 11.

**Host:** `apps/web` dev server (`pnpm --filter web dev`) against
`localhost:3000`, database = the `sparstrowgen-staging` Supabase project (the
only one that exists, per `runbooks/deploy-web-app.md`). **Browser:** Playwright
MCP, not the in-app Browser pane — the pane does not composite frames in this
environment (`runbooks/agent-browser-session.md`).

**What was clicked/typed**, in order: signed in landing on `/setup` → typed
"Sri Hari" into the profile name, blurred → typed "Sparstrow Inc" into the
workspace name, blurred → navigated to `/machines` via the guide's own link →
minted a pairing code from the page's own `fetch('/api/v1/pairing-codes')` →
paired and started a real local core against it → returned to `/setup`,
observed the machine step flip to done → visited `/` (dashboard), confirmed
the setup card absent → visited `/settings`, both Account→Profile and
Workspace→General tabs → forced `/api/v1/workspace` to `503` via
`page.route`, reloaded, observed the stuck-loading bug, fixed it, re-tested,
observed correct recovery and clicked Retry → toggled Light theme → resized to
375×800, confirmed `scrollWidth === innerWidth === 375`.

**What was found and fixed, not merely observed:**

1. [`BUG-2026-08-20-setup-workspace-error-never-settles`](../../bug/BUG-2026-08-20-setup-workspace-error-never-settles.md) —
   the workspace step's `unknown` state was structurally unreachable before
   this pass; a feedback loop between the step's inline form and the query it
   observes kept the page on loading skeletons forever whenever `/workspace`
   genuinely failed. Fixed in `setup.tsx` by latching the loading gate.
2. [`BUG-2026-08-18-shell-invents-name-from-email`](../../bug/BUG-2026-08-18-shell-invents-name-from-email.md) —
   pre-existing, predicted during M9, closed here while implementing the
   dropdown-label fallback this task's own checklist called for.

Neither would have been caught by `setupSteps()`'s unit tests, `pnpm test`, or
a typecheck — both needed a real render, and the first specifically needed a
*forced failure* render, which is exactly why AGENTS.md §3.10 requires this
loop rather than trusting green CI.

**Test count:** `pnpm -r test` — 1247 passed / 4 skipped (see Section E).
`pnpm -r typecheck` — 7/7 packages clean. `pnpm --filter web build` succeeds
and lists `/setup`.

**What remains open, each with a `KnownGaps.md` entry rather than left
silent:**

- Scenario 11 — no pre-existing account available to this harness
- The desktop/Electron build was never launched — its `/setup`-absence and
  `WorkspaceSwitcher` fallback are argued from the code (route grep, the
  `enabled` gate), not observed rendering
- The dashboard setup card's own **populated** and **loading** states were
  never visited (only its complete/absent state was)
- Keyboard-level Enter/Escape on the form fields, save-doesn't-blank-others at
  the database level, counters driven to their limit, and the image-upload
  round trip through `<ImageUploadField>` specifically (as opposed to the
  direct API proof in `T-M9-04`) were not re-driven live this pass
- Mono surface and explicit focus-visible auditing were not checked (only
  Paper, both modes)

None of these are contradicted by anything observed — they are simply
**not yet proven**, and are recorded as such rather than assumed.
