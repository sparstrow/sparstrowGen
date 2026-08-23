# Setup and Machines — 2026-08-16

| | |
|---|---|
| **Spec** | [`../specs/2026-08-16-setup-and-machines.md`](../specs/2026-08-16-setup-and-machines.md) (reviewed 2026-08-16, six decisions) |
| **Status** | **M8 complete** · **M9 done except the HTTP half of its verification** · **M10 build complete, verification partly done** (01–04 done and live-verified, closing two real bugs found in the process; 05 has scenario 11 and some form-level micro-behaviours still open as `G-25`/`G-26`) · **M11 done-with-known-residue, 2026-08-22** — the owner-action block cleared (a scratch machine paired live to `staging.sparstrow.com`), all five tasks ran, five real defects found (one fixed outright, four filed), `G-12`/`G-13`/`G-16` rewritten to their exact residue and a new gap (`G-27`) opened. **Not** `✅ Completed` — named residue remains (a second machine, a second account, the owner's 60s network-cut decision, and computer-use-gated Electron interaction); see this file's own Result section and `T-M11-05`'s |
| **Trigger** | Owner, after deploying `staging.sparstrow.com`: a Machines menu of its own, and a setup guide that shows what is left |
| **Depends on** | M1–M7 (all code-complete). One migration, in M9. |
| **Touches** | `packages/ui/src/routes/pages/`, `packages/ui/src/components/`, `packages/ui/src/api/hooks.ts`, `apps/web/src/app/`, `apps/web/src/lib/api/handlers/`, `packages/shared/src/cloud.ts`, `packages/shared/src/db/schema.ts`, `packages/shared/drizzle/policies/`, `packages/core/src/cli/pair.ts` |
| **Tasks** | `doc/tasks/M8/` · `doc/tasks/M9/` · `doc/tasks/M10/` · `doc/tasks/M11/` |
| **Open questions** | none |

## Summary

Serves [`specs/2026-08-16-setup-and-machines`](../specs/2026-08-16-setup-and-machines.md).
Machines gets a top-level route by **promoting the existing `RuntimesCard`**
into a page and deleting it from Settings; the setup guide gets a `/setup`
route whose three steps are **derived** from the profile row, the workspace row
and the machine list rather than stored as ticks. The new server surface is
profile and workspace editing — avatar/name/about-you and
logo/name/description/context — plus the migration that stops the database
inventing a name for either, which is what turns "is this step done?" from a
heuristic into a plain emptiness check.

**One migration** — three columns, and a `bootstrap_workspace` that stops
inventing names (spec decision 6). No new tables. Every runtime endpoint US1
needs already exists and is verified live (M3/M4).

## What the spec asks for that isn't obvious

**Five things read as small in the spec and are not.**

**1. "Show it as unreachable" is not a rename.** The row today prints
`online` or `last seen 4m ago` from a boolean
([`runtimes-card.tsx:179`](../../packages/ui/src/components/runtimes-card.tsx:179)),
and `runtimes.status` in Postgres carries something else entirely — what the
daemon *declares* about itself (`draining`), not whether it can be reached.
FR-006 and FR-007 together mean the label has to come from **one function that
sees both**, or adding `sleeping` later ([`D-16`](../Deferred.md)) reshapes
every call site instead of adding a branch. That function does not exist today.

**2. There is no profile-editing surface anywhere, and the profile step needs
one.** `ProfileCard`
([`settings.tsx:588`](../../packages/ui/src/routes/pages/settings.tsx:588)) is
read-only — name, email, provider, id, and a sign-out button. Spec decision 6
turns it into a form with an avatar, a name and an about-you field, which means
this phase converts an existing display-only card as well as building a new
guide step. Two of those four things (`bio`, image upload) do not exist in any
form today.

**3. There are two places a display name lives, and they can disagree.**
`account.name` and `account.avatarUrl` are read from the Supabase **auth
session's** metadata
([`account-snapshot.ts:37-44`](../../apps/web/src/lib/auth/account-snapshot.ts:37)),
while `public.users.name` is written **once**, at bootstrap, from that same
metadata
([`004_bootstrap_rpc.sql:66-77`](../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:66)).
Writing a name to one and reading it from the other is a rename that appears to
work and reverts on the next page load. Decision 9 is the fix.

**3a. Both name columns are `notNull` with no default.** `users.name` and
`workspaces.name` are `text().notNull()`
([`schema.ts`](../../packages/shared/src/db/schema.ts)), which is why decision 6
resolves "unset" as `''` rather than `NULL` — and why removing the bootstrap
fallbacks is a migration rather than an edit to one SQL function.

**4. The web dashboard is not the shared dashboard.**
`apps/web/src/app/page.tsx` is its own ~200-line implementation, not a
re-export of `packages/ui/src/routes/pages/dashboard.tsx` like every other
route. A setup card "on the dashboard" has to be placed in the web file
specifically; putting it in the shared page would show it to nobody.

**One thing reads as large and is not.** US1's five operations — pair, rename,
revoke, remove, per-machine settings — are all built, wired to real endpoints,
and verified live on staging in M3 and M4. US1 is a **relocation**, not a
feature build.

## Work breakdown

### Foundational — blocks US2 only

| Work | Why no story owns it |
|---|---|
| Migration: `users.bio`, `workspaces.logo_url`, `workspaces.context`; `bootstrap_workspace` stops inventing names; one-time cleanup of the names it already invented | Columns and a stored procedure. Decision 6 depends entirely on it, and nothing about it is visible until a form renders. |
| `GET`/`PATCH` workspace handler (name, description, context, logo) | An endpoint. It exists so the workspace form and the guide's step-2 completion rule have something to call. |
| `GET`/`PATCH` profile handler (name, bio, avatar) | Same shape, and it must write auth metadata *and* `public.users` in one path — invisible plumbing that decides whether a rename survives a reload. |
| Storage bucket, RLS policies, and the upload path for avatar and logo | New infrastructure this repo has never had. Cuttable on its own (decision 7a); until it exists both forms work and fall back to initials. |
| `useWorkspace` / `useUpdateWorkspace` / `useProfile` / `useUpdateProfile` hooks | Query-cache wiring in `hooks.ts`. Demos to nobody. |

US1 has **no** foundational rows. That is not an oversight — every endpoint it
needs shipped in M3/M4, which is why it can go first and alone.

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1** | `/machines` route in both hosts; `MachinesPage` promoted from `RuntimesCard`; sidebar entry; delete the Settings card; `machineState()` in `@sparstrow/shared` + the two-state row; honest pairing instructions; fix the four CLI path strings ([`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md)) | Pair, see status, rename, revoke, remove a machine from a first-class page, never opening Settings |
| **US2** | `setupSteps()` derivation; `/setup` route + `SetupGuide`; dashboard entry card; the **profile form** (avatar, name, about you) and the **workspace form** (logo, name, description, context, slug shown read-only), each rendered in both the guide and its permanent Settings home; sidebar shows the real workspace name | A fresh account is walked from nothing to a paired machine, and a half-finished one is told what is left |
| **US3–US5** | Walking the acceptance scenarios against `staging.sparstrow.com` with a machine actually pointed at it | The verification pass [`G-12`](../KnownGaps.md) and [`G-16`](../KnownGaps.md) have been waiting for |

## Decisions

### 1 — The Machines page is a promotion of `RuntimesCard`, not a rewrite

`runtimes-card.tsx` already implements all four states, the live countdown, the
auto-retire-on-pair effect, both confirm dialogs, inline rename, and the
`reportedSettings`-only snapshot control. Three of those exist because a
specific failure was reasoned about in writing — the countdown because a dead
code gets read into a terminal, the auto-retire because a *redeemed* code keeps
counting down, and the reported-settings discipline because that is the whole
reason `G-6` closed rather than reopening elsewhere.

A fresh page written against the same hooks would silently drop all three. So
the components move to `packages/ui/src/routes/pages/machines.tsx` and lose
only their `Card` chrome. **Rejected:** rendering `<RuntimesCard />` inside a
page wrapper — it keeps a card header that now duplicates the page title, and
leaves the empty state sized for a settings column rather than for the most
important screen in the spec.

### 2 — Reachability is one derived function, and `runtimes.status` is not touched

New in `packages/shared/src/cloud.ts`, next to `isRuntimeOnline`:

```
machineState(status, lastHeartbeat, now) -> "active" | "unreachable" | "draining"
```

Reachability stays **derived from heartbeat age** — M3 decision 4, restated in
[`system.ts:11-18`](../../apps/web/src/lib/api/handlers/system.ts:11) and in
the `/runtimes` handler: a machine that crashes writes nothing, so a stored
status is whatever it was when it was last healthy. Changing the column's
vocabulary would break that and buy nothing.

This is what satisfies FR-007. When [`D-16`](../Deferred.md) is unparked, a
daemon announces suspension by declaring `status = 'sleeping'` before it goes
quiet, and this function gains **one branch** — a declared `sleeping` outranks
derived silence — with no call site, no component, and no column changed.
**Rejected:** computing the label inside the row component, which is where it
lives today and is exactly what would make `D-16` a reshape.

### 3 — The Settings card is deleted, not aliased or redirected

Decision 4 of the spec. No re-export, no "moved" placeholder, no redirect from
Settings → Workspace → General. The card is one of five in that tab and the
others stay; a stub that says "this moved" is a third thing to maintain that
tells a returning user something the sidebar already shows.

Consequence to check, not assume: `WipSnapshotCard`
([`settings.tsx:252`](../../packages/ui/src/routes/pages/settings.tsx:252)) is
the **local build's** own snapshot control and is unrelated to the per-runtime
one inside `RuntimesCard`. Removing the wrong one deletes a working local
setting. The task names both.

### 4 — The guide is a route plus a dashboard card, not a modal

`/setup` is a real page. A modal on first load satisfies scenario 1 and breaks
scenarios 2 and 6 at once — you cannot return to something you dismissed, and a
thing you must dismiss is a gate. The dashboard card is what makes scenario 1
true ("not an empty dashboard") without blocking anything, and it disappears
when every step is done (FR-011), leaving `/setup` reachable and reading
"you're set up".

The card goes in `apps/web/src/app/page.tsx` specifically — see *what isn't
obvious* #4. The local desktop build has no account and no workspace to name,
so it gets neither the card nor the route; `useAccount()` returning `null`
already means "this host has no concept of accounts"
([`account.tsx:14-17`](../../packages/ui/src/lib/account.tsx:14)) and is the
existing, correct switch.

### 5 — Setup state is one pure function over three inputs the app already has

```
setupSteps({ account, workspace, machines }) -> Step[]
```

with `Step = { id, state: "done" | "current" | "todo" | "unknown", … }`. It
reads the account snapshot, the workspace row, and `useRuntimes()` — three
queries the shell already runs — and stores nothing. That is FR-009 and FR-010
in one line: an account that predates the guide is not a special case, because
there is no stored flag it could be missing.

`"unknown"` exists for scenario 5 and the spec's error state: a step whose
query failed must say it cannot be read, not fall through to "not done" and
send someone to redo work they already did. **Rejected:** an
`onboarding_completed` column, which would be a second source of truth
guaranteed to drift from the first the moment a step is completed elsewhere in
the app — the exact failure scenario 3 is written against.

Being a pure function is also what makes it *testable*: `packages/ui` has no
jsdom and cannot mount a component ([`G-13`](../KnownGaps.md)), so the
derivation is proved as logic and only its rendering is left to the browser
pass. Same shape M5 used for `live-events.ts`.

### 6 — Nothing is auto-named, so "is this done?" needs no heuristic

Spec decision 6, and it is the load-bearing one in this plan.

An earlier draft proposed detecting an unfilled profile by comparing the stored
name against the email local part. The owner rejected the premise: **stop
inventing a name at all.** `bootstrap_workspace` loses both fallbacks — the
`split_part(email, '@', 1)` that produces `sriharicoder`, and the literal
`'Personal Workspace'` — and a fresh account arrives with neither name set.

The completion rule becomes a plain emptiness check:

```
profile   done  ⇔  users.name is non-empty after trimming
workspace done  ⇔  workspaces.name is non-empty after trimming
```

That is strictly better than the heuristic it replaces, which could have been
wrong about a genuine name — someone actually called by their email local part
would have read as not-done forever. It also costs a migration and a one-time
data cleanup, which the heuristic did not.

**Empty string, not `NULL`.** Both columns are `text().notNull()` today. Making
them nullable ripples the type change through every consumer — the sidebar, the
account snapshot, every read of `workspace.name` — for no gain, since "unset"
is checked in exactly one place (`setupSteps()`). `''` keeps every existing
call site compiling and unchanged. The one thing this obliges: every display of
a name needs a fallback for empty, which is one `||` per site and is listed in
`T-M9-01`.

### 7 — Both setup steps are real forms, and only the name is required

Spec decision 6's table, made concrete:

| Step | Fields | Storage |
|---|---|---|
| **Profile** | avatar, name, about you | `users.avatar_url` (exists), `users.name` (exists), `users.bio` (**new column**) |
| **Workspace** | logo, name, description, context | `workspaces.logo_url` (**new**), `workspaces.name` (exists), `workspaces.description` (exists), `workspaces.context` (**new**) |

**Only the name gates the step** (FR-020). An avatar upload that blocks setup
is the kind of friction that makes people abandon a guide, and "about you" is
most useful written later, once someone knows what they want their agents to
know.

**About-you and context have a real consumer.** They are the text an agent
reads before working on the owner's behalf. This is not profile decoration
borrowed from a social app — it is why the fields are worth the columns. What
actually feeds them into a run is **out of scope here** and belongs to its own
work; this plan stores them and shows them.

**The fields live in Settings permanently** (FR-021), and the guide embeds the
same components. One implementation, two placements — the same rule spec
decision 4 used to justify deleting the Machines card rather than keeping two.

### 7a — Image upload is the one genuinely new piece of infrastructure

This codebase has **no Supabase Storage usage at all** — verified by search.
Avatar and logo need a bucket, RLS policies on `storage.objects`, an upload
path, and a size/type guard. That is real work, and it is isolated into its own
task (`T-M9-04`) so it can be cut without touching anything else: without it,
both surfaces still work and fall back to the initials badge the shell already
renders
([`workspace-switcher.tsx:38-45`](../../packages/ui/src/components/layout/workspace-switcher.tsx:38)).

One bucket, two paths, one component. Building avatar-only and adding the logo
later would mean doing the bucket, the policies and the guard twice.

### 8 — The workspace slug is set once from the first name, shown, and frozen

`workspaces.slug` is referenced by **no application code** — verified by search
across `apps/web/src`, `packages/core/src` and `packages/ui/src`. It is written
once by `bootstrap_workspace` as `personal-<8 chars>` and never read.

The owner sees it as a read-only field (FR-022). It is derived from the name
the first time a name is set, and never moves again — a slug that mutates on
every rename is a broken bookmark waiting for the day something *does* resolve
by it, and an editable text box for a value nothing resolves by yet is a second
thing to get wrong.

### 9 — Identity writes go through one handler that updates both stores

Auth metadata and `public.users` both hold a display name **and an avatar URL**
(*what isn't obvious* #3). `PATCH /me` writes **both** — `supabase.auth.updateUser`
for the session the shell reads from, and the `public.users` row the cloud
schema joins on — and the handler is the only place that knows they are two.

`bio` is written to `public.users` **only**. The shell never displays it, so
putting it in the session's JWT-adjacent metadata would inflate every request's
token for text nothing on that path reads.

**Rejected:** writing only `public.users` and having the UI read from there. It
is one fewer write and it means the sidebar and Settings show the old name
until the next full page load, because `WebAccountProvider` is fed from the
session snapshot, server-rendered, deliberately, to stop a hydration mismatch.

### 10 — The pairing instructions say what is actually required today

FR-016 and spec decision 3. The panel currently prints `sparstrow pair <code>`
as though it were a command you have
([`runtimes-card.tsx:110-112`](../../packages/ui/src/components/runtimes-card.tsx:110)),
and it is published nowhere ([`D-10`](../Deferred.md)). The panel gains one
line naming the dev checkout as today's requirement, and the CLI's four wrong
path strings are corrected to the destination this plan creates — the bug fix
and the move are the same edit, which is why the bug rides in M8 rather than
being fixed separately and then immediately invalidated.

## Phases

### M8 — Machines gets a menu of its own · **serves US1**

**Delivers:** a `/machines` destination in the sidebar, one click from
anywhere, carrying pair / status / rename / revoke / remove; two-state
reachability with a last-seen time; the Settings card gone; the CLI pointing at
a place that exists.

**Depends on:** nothing. All five endpoints ship already.

**Done when:** US1's eleven acceptance scenarios are walked on a rendered page,
and `grep -r "Runtimes" packages/core/src/cli` returns nothing user-facing.

### M9 — Workspace and profile identity · **foundational, blocks M10**

**Delivers:** the migration (two new columns, a logo column, and a
`bootstrap_workspace` that invents nothing), `GET`/`PATCH /workspace`,
`GET`/`PATCH /me`, the storage bucket and upload path, and their hooks.
Server-side validation, slug uniqueness, RLS-scoped, unit-tested through the
router the way every other handler group is.

**Depends on:** nothing.

**Done when:** a brand-new account has **no** name in either table, an edit
round-trips through the API and survives a reload, an image uploads and comes
back, and cross-workspace writes are denied — proved the way M2 proved its
handlers, not by inspection.

### M10 — The setup guide · **serves US2**

**Delivers:** `setupSteps()`, `/setup`, the dashboard card, the profile and
workspace forms in both their guide and Settings placements, and the sidebar
showing the real workspace name.

**Depends on:** M9 (handlers), and soft-depends on M8 for the machines step's
link target.

**Done when:** US2's eleven acceptance scenarios are walked, including on an
account created before the guide existed.

### M11 — Walk the spec against staging · **serves US3–US5, closes `G-12`/`G-16`**

**Delivers:** the verification pass, not new code. US3's live run, US4's four
failure messages, US5's desktop window — plus the residue of
[`T-M7-04`](../tasks/M7/T-M7-04-verification.md) sections C–D and
[`T-M3-08`](../tasks/M3/T-M3-08-verification.md).

**Depends on:** M8 and M10, **and on an owner action**: a machine's
`SPARSTROW_CLOUD_URL` / `SPARSTROW_APP_URL` pointed at
`staging.sparstrow.com`. Tracked in
[`runbooks/README.md`](../runbooks/README.md); nothing in this phase can start
without it.

**Done when:** every scenario either passes or has a `KnownGaps.md` entry
naming what blocked it. `G-12` and `G-16` are closed or rewritten down to
exactly what is still unproved (SC-007).

## Scope boundaries

- **Sleep detection and waking** — [`D-16`](../Deferred.md). Two states this
  round; decision 2 is what keeps the third cheap to add.
- **Machine distribution** (a published `sparstrow` build, service
  registration, native packaging) — [`D-10`](../Deferred.md), its own spec
  immediately after this one. This round only tells the truth about it
  (decision 9).
- **Multi-workspace switching and invites** — [`D-7`](../Deferred.md). The
  naming control edits *your* workspace; it is not a picker, and
  `getActiveWorkspaceId`'s multiple-workspace branch stays the 400 it is today.
- **Production Supabase for `main`** — [`D-15`](../Deferred.md). Everything
  here targets staging.
- **Email change and password change.** Decision 7 adds an avatar, a name and
  an about-you field, and stops there. An email change is an auth flow with a
  confirmation loop and it completes no setup step.
- **Feeding "about you" and "context" into an actual run.** This plan stores
  and displays them; wiring them into an agent's prompt is its own piece of
  work with its own decisions about where in the context they sit and what
  happens when they are empty. Recorded in [`../Ideas.md`](../Ideas.md).
- **From the reference screenshots, deliberately not taken:** an issue-number
  prefix (this product has no issues), Leave workspace and Delete workspace
  (destructive, and the account already has its own deletion path in
  `DangerZoneCard`), and Members (invites are [`D-7`](../Deferred.md)). Spec
  decision 6 names these too, so they are not quietly dropped.
- Everything already listed under the spec's own **Assumptions** — HITL
  ([`D-1`](../Deferred.md)), agent-definition sync
  ([`D-9`](../Deferred.md)), the Realtime doorbell
  ([`D-12`](../Deferred.md)) — cited, not repeated.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| **SC-001** — a new account reaches a paired machine on the app's word alone | M11: create a fresh account on staging, follow only the guide, pair. The dev-checkout requirement is allowed to appear; being *wrong* about it is not. |
| **SC-002** — Machines in one click from anywhere | M8: the sidebar entry renders in the shared shell, so it is present on every route by construction; confirmed visually in the browser pass. |
| **SC-003** — displayed state matches reality, both states, forced deliberately | M11: start core paired to staging → active; stop it → unreachable within `HEARTBEAT_STALE_AFTER_MS` (90s) with a last-seen time. Both forced, not waited for. |
| **SC-004** — pair/rename/revoke/remove without Settings, card gone | M8: all four exercised on `/machines`; Settings → Workspace → General inspected for absence and for nothing orphaned. |
| **SC-005** — steps match reality, incl. an account predating the guide | M10: `setupSteps()` unit-tested across every combination; then live — pair from `/machines` and confirm the guide's step flips without a stored tick. The pre-existing account is the owner's own. |
| **SC-008** — a new account contains no name the owner did not type | M9: create an account on staging and **read `users.name` and `workspaces.name` directly**. Both empty. Reading the screen is not the check — the screen has display fallbacks. |
| **SC-006** — a browser-started run executes on the paired machine with a live transcript | M11, and this is the one that also closes [`G-13`](../KnownGaps.md)'s live half. |
| **SC-007** — `G-12`/`G-16` closed or rewritten | M11's final task edits `KnownGaps.md` in place. Rewriting down to residue counts; leaving them untouched does not. |

**What may not be reachable, said now rather than discovered at the end:**

- **The browser pane has never composited a frame in this environment** —
  recorded three times ([`G-12`](../KnownGaps.md), `G-13`, `G-16`). M8 and M10
  are the most UI-heavy phases this repo has attempted, and their acceptance
  scenarios are almost entirely visual. Decisions 2 and 5 are partly a response
  to that: the label vocabulary and the step derivation are pure functions
  precisely so the *logic* is provable without a renderer, leaving only layout
  and legibility to the pane. If the pane still cannot render, that residue is
  a `KnownGaps.md` entry, not a ticked box.
- **M11 cannot start at all** until the owner points a machine at staging.
  That is a hard block, not a slow path.
- **US4 scenario 1 and US5 scenario 3** need a revoked token and an unreachable
  host respectively — both forceable solo. US3 needs a real agent provider
  installed and authenticated on the paired machine.

## Result

**M11 closed out 2026-08-22.** Full detail lives in
[`tasks/M11/T-M11-05-gap-reconciliation.md`](../tasks/M11/T-M11-05-gap-reconciliation.md)'s
Result section; this is the plan-level summary.

**What the owner can actually do now, walked live against
`staging.sparstrow.com` with a real scratch machine (never the owner's own
`~/.sparstrow`):**

- **US1 — pair, see status, rename, revoke, remove a machine** from
  `/machines`, never opening Settings. Fully usable; both machine states
  forced and timed correctly (active immediately, unreachable within the
  90-second `HEARTBEAT_STALE_AFTER_MS` window, back to active within one
  30-second heartbeat).
- **US3 — start a run from the browser and watch it execute on the paired
  machine.** Fully usable end to end — dispatch, real local execution
  (confirmed via the machine's own process/log, not just a cloud row), and a
  terminal status with correct metrics. Watching it live works at the data
  layer for every provider (progressive delivery, exact local/cloud event-count
  match) and renders correctly on screen for `claude-code`; for `antigravity`
  specifically the transcript card shows nothing while the run genuinely
  progresses — a real, filed rendering bug, not a delivery gap.
- **US4 — tell which thing is wrong (code, network, machine).** Fully usable.
  All four deliberate failures (revoked, unreachable control plane, code
  already used, code expired) produce distinct, accurate messages and exit
  codes, and the token is never printed anywhere.
- **US5 — the desktop app shows the deployed product.** Partially usable. The
  Electron shell was launched live for the first time ever, three separate
  times: it genuinely loads the deployed app when `SPARSTROW_APP_URL` is set,
  falls back to the local core UI exactly as before when unset, and shows a
  real native offline screen (window-title-confirmed) when unreachable.
  Signing in inside the window, and the closure of "a machine seeing itself"
  in `/machines` from its own desktop app, remain unproved — this pass had no
  interactive access to drive the window (computer-use returned `"user
  interrupt"` on every attempt), which was the explicitly-flagged risk going
  in.
- **US2 — the setup guide**, from M10, is unaffected by anything M11 found.

**Five real defects found, matching every prior phase's pattern of the plan
meeting reality:**

1. **Creating a team, project, or agent 500'd unconditionally on staging** —
   the single most severe finding of this plan. All three tables have a
   `NOT NULL` slug column that neither the client nor the handler ever
   populated. **Fixed directly in this pass** (small, mechanical, identical
   shape across three files, verified against the same staging database via
   a local dev server) —
   [`BUG-2026-08-22-team-create-500-missing-slug`](../bug/BUG-2026-08-22-team-create-500-missing-slug.md).
2. **`/teams` and `/teams/[teamId]` crash outright once a team exists** —
   `GET /teams`/`GET /teams/:id` never join the member/project data the
   frontend's own schema promises. Invisible in every prior pass because they
   only ever exercised the empty state. Filed, not fixed (real query-design
   work) —
   [`BUG-2026-08-22-teams-page-crashes-with-real-data`](../bug/BUG-2026-08-22-teams-page-crashes-with-real-data.md).
3. **`/chat` cannot start a new conversation at all** — `POST /api/v1/chat/sessions`
   has no route, real or stub. The single most discoverable "talk to an
   agent" entry point in the product 404s on first use —
   [`BUG-2026-08-22-chat-new-session-404s`](../bug/BUG-2026-08-22-chat-new-session-404s.md).
4. **`antigravity`'s live transcript renders as nothing** despite streaming
   correctly, because the shared transcript component has no case for its
   event type —
   [`BUG-2026-08-22-antigravity-transcript-not-rendered`](../bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md).
5. **The desktop shell's local supervisor reports its own core as unhealthy**
   every time, even when the core's own log shows it became ready well
   inside the deadline — cosmetic today, root cause not isolated —
   [`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](../bug/BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md).

**Registers updated:** `KnownGaps.md`'s `G-12`, `G-13`, `G-16` rewritten to
their exact residue (none fully closable — each still names real, specific
work); `G-27` opened (the `claude-code` capability probe can't distinguish
"binary installed" from "actually authenticated," found live when a run
dispatched to a machine with an expired CLI login took three minutes of
legible retries to fail rather than failing at spawn). Knowledge Center: six
articles corrected — the four mandatory global-claim pages
(`what-is-sparstrowgen.md` needed no change; `first-run-setup.md`,
`limitations.md`, `providers-and-execution-modes.md` each had a real
overclaim or a claim gone stale since it was written) plus two more
(`runs-and-transcripts.md`, `machines.md`) whose specific sentences this
pass's findings directly falsified.

**Why the plan does not read `✅ Completed`:** real, named residue remains —
a second paired machine (reassign, lease-recovery timing), a second
workspace account (cross-device streaming, cross-workspace isolation), the
owner's own decision on the 60-second network cut, and interactive access to
drive the Electron window. None of these are unknowns any more — each is a
specific, named thing in `KnownGaps.md` with what would close it — but
"named residue" and "done" are different words for a reason.
