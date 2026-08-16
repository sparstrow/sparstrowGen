# Setup and Machines — 2026-08-16

| | |
|---|---|
| **Spec** | [`../specs/2026-08-16-setup-and-machines.md`](../specs/2026-08-16-setup-and-machines.md) (reviewed 2026-08-16, five decisions) |
| **Status** | Draft — awaiting approval · M8 first |
| **Trigger** | Owner, after deploying `staging.sparstrow.com`: a Machines menu of its own, and a setup guide that shows what is left |
| **Depends on** | M1–M7 (all code-complete). No new schema. |
| **Touches** | `packages/ui/src/routes/pages/`, `packages/ui/src/components/`, `packages/ui/src/api/hooks.ts`, `apps/web/src/app/`, `apps/web/src/lib/api/handlers/`, `packages/shared/src/cloud.ts`, `packages/core/src/cli/pair.ts` |
| **Tasks** | `doc/tasks/M8/` · `doc/tasks/M9/` · `doc/tasks/M10/` · `doc/tasks/M11/` |
| **Open questions** | none |

## Summary

Serves [`specs/2026-08-16-setup-and-machines`](../specs/2026-08-16-setup-and-machines.md).
Machines gets a top-level route by **promoting the existing `RuntimesCard`**
into a page and deleting it from Settings; the setup guide gets a `/setup`
route whose three steps are **derived** from the account, the workspace name,
and the machine list rather than stored as ticks. The only genuinely new
server surface is workspace and profile naming — two `PATCH` handlers — because
naming is what makes the guide's first two steps real rather than decorative.

No schema migration. No new tables. Every runtime endpoint US1 needs already
exists and is verified live (M3/M4).

## What the spec asks for that isn't obvious

**Four things read as small in the spec and are not.**

**1. "Show it as unreachable" is not a rename.** The row today prints
`online` or `last seen 4m ago` from a boolean
([`runtimes-card.tsx:179`](../../packages/ui/src/components/runtimes-card.tsx:179)),
and `runtimes.status` in Postgres carries something else entirely — what the
daemon *declares* about itself (`draining`), not whether it can be reached.
FR-006 and FR-007 together mean the label has to come from **one function that
sees both**, or adding `sleeping` later ([`D-16`](../Deferred.md)) reshapes
every call site instead of adding a branch. That function does not exist today.

**2. The guide's "profile" step has nothing to complete.** `ProfileCard`
([`settings.tsx:588`](../../packages/ui/src/routes/pages/settings.tsx:588)) is
read-only — name, email, provider, id, and a sign-out button. There is no
profile-editing surface anywhere in the codebase. This is decision 5's problem
a second time, at the step before it, and the spec answers it without naming
it: scenario 9 rules that a value **the owner was never asked to supply** reads
as not-yet-done. See decision 7.

**3. There are two places a display name lives, and they can disagree.**
`account.name` is read from the Supabase **auth session's** metadata
([`account-provider.tsx:41`](../../apps/web/src/components/auth/account-provider.tsx:41)),
while `public.users.name` is written **once**, at bootstrap, from that same
metadata with an email-local-part fallback
([`004_bootstrap_rpc.sql:66-77`](../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:66)).
Writing a name to one and reading it from the other is a rename that appears to
work and reverts on the next page load.

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
| `GET`/`PATCH` workspace identity handler (name, slug) | An endpoint. Nothing renders it; it exists so the naming control and the guide's step-2 completion rule have something to call. |
| `PATCH` profile identity handler (display name) | Same shape, and it must write auth metadata *and* `public.users` in one path — invisible plumbing that decides whether a rename survives a reload. |
| `useWorkspace` / `useRenameWorkspace` / `useUpdateProfile` hooks | Query-cache wiring in `hooks.ts`. Demos to nobody. |

US1 has **no** foundational rows. That is not an oversight — every endpoint it
needs shipped in M3/M4, which is why it can go first and alone.

### Per story

| Story | Work | Delivers |
|---|---|---|
| **US1** | `/machines` route in both hosts; `MachinesPage` promoted from `RuntimesCard`; sidebar entry; delete the Settings card; `machineState()` in `@sparstrow/shared` + the two-state row; honest pairing instructions; fix the four CLI path strings ([`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md)) | Pair, see status, rename, revoke, remove a machine from a first-class page, never opening Settings |
| **US2** | `setupSteps()` derivation; `/setup` route + `SetupGuide`; dashboard entry card; `WorkspaceNameCard` rendered in both the guide and Settings → Workspace → General; profile-name control; sidebar shows the real workspace name | A fresh account is walked from nothing to a paired machine, and a half-finished one is told what is left |
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

### 6 — The workspace name is editable; the slug is derived once and then frozen

FR-017 asks for name *and* slug. `workspaces.slug` is referenced by **no
application code** — verified by search across `apps/web/src`,
`packages/core/src` and `packages/ui/src` — it is written once by
`bootstrap_workspace` as `personal-<8 chars>` and never read.

So the naming control takes a name. The first real rename also sets the slug
from it (uniqueness-checked); later renames leave the slug alone. Reasoning:
an editable text field for a value nothing resolves by is a second thing to get
wrong for no gain today, while a slug that silently mutates on every rename is
a broken bookmark waiting for the day something *does* resolve by it. Setting
it once gives the workspace a real slug and never moves it again.

**This narrows FR-017**, which reads as though the owner types both. Flagged
here rather than absorbed silently.

### 7 — The profile step is done when the owner has supplied a display name

The spec never says what completes the profile step, and the honest default —
"you signed up, so it's done" — makes the guide's first step decorative. That
is precisely what decision 5 refused to accept for the workspace step, and
scenario 9 states the underlying rule in general terms: a value **the owner was
never asked to supply** does not count as done.

Applied here: `public.users.name` starts as the email local part for anyone who
signs up with email and password
([`004_bootstrap_rpc.sql:66-71`](../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:66)),
which nobody chose. So the step reads **not done** while the name still equals
the email local part, and its action is an inline name field — the same shape
as the workspace naming control, roughly a card and one handler.

> ⚠️ **This is consequential scope the spec did not ask for**, arrived at by
> generalizing an owner decision rather than by being told. It is flagged the
> way decision 5 was, and it is the one thing in this plan worth a veto: if the
> owner would rather the profile step read as already-done on signup, delete
> `T-M9-02` and the profile half of `T-M10-04` and the rest of the plan is
> unaffected.

Someone who signed in with GitHub or Google **already has** a real
`full_name`, so their step reads done immediately — correctly, since they were
asked for it, just not by us. (Those providers are parked as
[`D-8`](../Deferred.md), so this is future-proofing, not a live path.)

### 8 — Identity writes go through one handler that updates both stores

Auth metadata and `public.users` both hold a display name (*what isn't
obvious* #3). `PATCH /me` writes **both** — `supabase.auth.updateUser` for the
session the shell reads from, and the `public.users` row the cloud schema joins
on — and the handler is the only place that knows they are two.

**Rejected:** writing only `public.users` and having the UI read from there. It
is one fewer write and it means the sidebar and Settings show the old name
until the next full page load, because `WebAccountProvider` is fed from the
session snapshot, server-rendered, deliberately, to stop a hydration mismatch.

### 9 — The pairing instructions say what is actually required today

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

**Delivers:** `GET /workspace`, `PATCH /workspace`, `PATCH /me`, and their
hooks. Server-side validation, slug uniqueness, RLS-scoped, unit-tested through
the router the way every other handler group is.

**Depends on:** nothing.

**Done when:** a rename round-trips through the API and survives a reload, and
cross-workspace rename is denied — proved the way M2 proved its handlers, not
by inspection.

### M10 — The setup guide · **serves US2**

**Delivers:** `setupSteps()`, `/setup`, the dashboard card, the workspace and
profile naming controls, and the sidebar showing the real workspace name.

**Depends on:** M9 (handlers), and soft-depends on M8 for the machines step's
link target.

**Done when:** US2's nine acceptance scenarios are walked, including on an
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
- **Profile avatar, email change, password change.** Decision 7 adds a display
  name and stops there. An avatar upload is storage, an email change is an auth
  flow with a confirmation loop, and neither completes a setup step.
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

<!-- Filled in as phases land. -->
