# Spec: Getting set up, and a home for my machines

| | |
|---|---|
| **Status** | **Draft v3 — owner-reviewed 2026-08-16, all open questions resolved. Ready to plan** |
| **Created** | 2026-08-16 |
| **Trigger** | Owner, after deploying `staging.sparstrow.com`: a dedicated Machines menu with CRUD and live status, and an interactive step-by-step setup guide |
| **Plan** | [`../plans/2026-08-16-setup-and-machines.md`](../plans/2026-08-16-setup-and-machines.md) — written 2026-08-16, phases M8–M11 |
| **Open questions** | none |

> **Scope.** From a fresh account to a machine that runs work. Setup, machines,
> pairing and status are steps in one journey, not separate features.
>
> **This spec is also the pending verification pass.** Almost everything under
> US3–US5 is already built and has never been *used* against a real
> deployment. Walking those acceptance scenarios is what
> [`G-12`](../KnownGaps.md) and [`G-16`](../KnownGaps.md) have been waiting
> for — a plan should close them in place, not open a parallel checklist.

## The experience today

**There is no setup guide. At all.** Nothing in the codebase matches
onboarding, getting-started, first-run, or setup — verified by search, not
assumed. A new account lands on the dashboard with no indication of what is
unfinished, what a workspace is for, or that agents need a machine before
anything can run.

**Machines have no home of their own.** They live as one card inside
Settings → Workspace → General, below Factory Health and above WIP Snapshot
([`settings.tsx:781-786`](../../packages/ui/src/routes/pages/settings.tsx:781)).
The sidebar has 16 destinations and none is Machines
([`app-shell.tsx:47-76`](../../packages/ui/src/components/layout/app-shell.tsx:47)).
The thing every agent run depends on is three clicks deep, next to unrelated
controls.

**The card itself is good, and has never been seen.** All four states are
already implemented — skeletons, a dashed empty panel that explains pairing,
populated rows with a live dot and a `last seen 4m ago`, and an inline error.
It has never been rendered in a browser ([`G-12`](../KnownGaps.md)).

**Nobody has ever paired against a deployed app.** Every daemon still defaults
to `localhost:3000` ([`config.ts:138`](../../packages/core/src/config.ts:138)).

**Two defects found while writing this spec:**

- The CLI sends users to *Settings → Workspace → **Runtimes***, a tab that
  does not exist — [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md).
  US1 moves the destination anyway, so the fix is part of this work.
- The command the UI tells you to run, `sparstrow pair <code>`, cannot be run
  on a machine without cloning this monorepo — `sparstrow` is published
  nowhere ([`D-10`](../Deferred.md)). See the sequencing decision below.

---

## Decisions taken at review — 2026-08-16

Four questions were open in v2. All are answered; recorded here because each
one shapes what gets built.

**1. The second state is "unreachable", not "turned off".** The app cannot
tell a powered-off machine from a crashed one or one whose wifi dropped — all
three produce the same silence. Saying "turned off" would assert a cause we do
not know, and would send the owner looking at the wrong thing. "Unreachable"
plus a last-seen time says exactly what is known and no more.

**2. Sleep detection is deferred entirely** — parked as
[`D-16`](../Deferred.md). Distinguishing a sleeping machine from an unreachable
one requires the machine to announce suspension *before* it goes quiet
(Electron's `powerMonitor`, or a per-OS mechanism for headless core), and even
then an ungraceful stop stays ambiguous forever. The owner chose to ship the
Machines menu and setup guide first and live with two states. **So this round
has two states, not three**, and the third returns with `D-16`.

**3. Distribution is the next round, not this one.** `sparstrow pair` cannot
run on a machine without a monorepo clone ([`D-10`](../Deferred.md)). Fixing
that means a published build, per-OS service registration, and native-module
packaging — its own piece of work with its own spec. **This round tells the
truth in its wording instead**; the next round makes the truth better.

**4. The Settings → Workspace Machines card is removed.** The new menu is the
only home. Two implementations of the same controls is the duplication that
drifts — one gets a fix and the other does not.

**5. The "workspace" setup step gets a real action: naming it.** Every account
already gets a workspace auto-created on first sign-in — hardcoded to
`"Personal Workspace"` with a generated slug
([`004_bootstrap_rpc.sql:92-98`](../../packages/shared/drizzle/policies/004_bootstrap_rpc.sql:92)) —
and no rename surface exists anywhere in the codebase today. Without this
decision, the guide's middle step would have nothing to do and nothing to
show as incomplete. The owner chose to build workspace name/slug editing
rather than drop the step or show it as always-done: a small, genuinely new
surface, and the first thing a multi-workspace future would need anyway.
**This is real new scope** the spec did not originally ask for — flagged here
so the plan doesn't absorb it silently.

---

## What I expect instead

I open the app on a fresh account and it walks me through getting set up, step
by step, telling me what is still unfinished. Machines get a menu of their
own, where I can pair one, see everything connected, tell at a glance whether
each is working or gone, and manage them without hunting through settings.

---

## User stories

> **US1 and US2 are the owner's own words**, captured 2026-08-16. US3–US5 are
> carried forward as inferred and still want correction, though they are
> lower priority and mostly describe already-built behaviour.

### US1 — Machines get a menu of their own (Priority: P1)

Machines are a first-class destination in the sidebar, not a card buried in
settings. I open it and see every machine connected to my workspace and
whether each is working, and I can pair a new one or manage an existing one
right there — rename, revoke, remove — without leaving the page.

**Why this priority:** every agent run needs a machine, so the thing the whole
product depends on should not be three clicks deep next to unrelated settings.
It is also where US2's final step sends people.

**Independent test:** open the Machines menu on `staging.sparstrow.com` and
pair a machine from it end to end, never opening Settings.

**Acceptance scenarios:**

1. **Given** I am signed in, **When** I look at the sidebar, **Then** there is
   a Machines destination reachable in one click from anywhere.
2. **Given** I open Machines with none paired, **When** the page loads,
   **Then** it explains what a machine is for and offers **Pair a machine** as
   the primary action — the empty state teaches the surface.
3. **Given** I press **Pair a machine**, **When** the code appears, **Then** I
   see the code, a live countdown, a copy button, and the exact steps to run on
   the machine — naming places that actually exist, and honest about needing a
   dev checkout today (decision 3).
4. **Given** a machine finishes pairing, **When** I look at the page without
   refreshing, **Then** it appears in the list.
5. **Given** a machine is running and reachable, **When** I look at it,
   **Then** it reads as active, with its name, OS, hostname, core version and
   what it can run.
6. **Given** a machine has stopped talking — off, asleep, crashed or
   disconnected — **When** I look at it, **Then** it reads as **unreachable**
   with when it was last seen, and does **not** claim to know which of those
   happened (decision 1).
7. **Given** a machine in the list, **When** I rename it, **Then** the new name
   sticks and is what I see everywhere that machine is named.
8. **Given** a machine in the list, **When** I revoke or remove it, **Then** I
   am told the difference before confirming, and the result matches what I was
   told.
9. **Given** a machine is unreachable, **When** I try a control that needs it,
   **Then** the control refuses with the reason rather than queuing silently —
   today's behaviour, preserved.
10. **Given** I go to Settings → Workspace → General, **When** I look for
    machines, **Then** the old card is gone (decision 4) and nothing is
    orphaned by its removal.
11. **Given** I am on the Machines page, **When** I do any of the above,
    **Then** I never had to open Settings.

---

### US2 — A setup guide that shows me what is left (Priority: P1)

When I create an account — or come back to one that is half-finished — the app
shows me what still needs doing to be set up, in order, and walks me through
it. Profile, then workspace, then machines. I can tell at a glance how far
along I am, and pick up where I left off.

**Why this priority:** the owner asked for it directly, and it is the only
story here that serves someone who is not already an expert in this product.
It is also what makes US1 discoverable rather than something you have to
already know about.

**Independent test:** create a fresh account and reach a paired, working
machine using only what the guide tells you.

**Acceptance scenarios:**

1. **Given** I have just created an account, **When** I land in the app,
   **Then** I am shown the setup steps and which one is next — not an empty
   dashboard.
2. **Given** I am partway through setup, **When** I return later, **Then** the
   guide shows completed steps as done and points me at the next one.
3. **Given** I complete a step elsewhere in the app — say I pair a machine from
   the Machines menu — **When** I look at the guide, **Then** that step reads
   as done. It reflects real state, never a separate checkbox I have to tick.
4. **Given** I am fully set up, **When** I look, **Then** the guide is not in
   my way — it stands down rather than nagging.
5. **Given** a step cannot be completed yet, **When** I reach it, **Then** it
   says so and why, rather than failing when I click.
6. **Given** I want to skip ahead, **When** I try, **Then** I can — the guide
   is a guide, not a gate.
7. **Given** I reach the workspace step, **When** I read it, **Then** I can
   give my workspace a real name in place, and doing so is what marks the step
   done (decision 5) — the default `"Personal Workspace"` name does not count
   as complete.
8. **Given** I reach the machines step, **When** I read it, **Then** it tells
   me plainly what connecting a machine currently requires, including the dev
   checkout, rather than implying a command that does not exist (decision 3).
9. **Given** an account that existed before this guide shipped, **When** I open
   it, **Then** the guide reflects what I have actually already done — an
   existing workspace still carrying its auto-generated name reads as
   not-yet-done, exactly like a new one, since nothing about that account ever
   asked the owner to name it either.

---

### US3 — Send work from the browser and watch it run on that machine (Priority: P2)

*(Carried from v1 — inferred, not dictated.)*

From the deployed app I start a run. It executes on the machine I paired, not
in the browser, and I watch it happen live.

**Why this priority:** pairing that leads nowhere proves plumbing, not a
product. First time the whole spine runs across a real network. Closes the
live half of [`G-13`](../KnownGaps.md).

**Independent test:** queue one run from `staging.sparstrow.com`, watch its
transcript while it executes on the paired machine.

**Acceptance scenarios:**

1. **Given** an active machine, **When** I start a run from the browser,
   **Then** it begins on that machine within seconds, untouched by me.
2. **Given** a run is executing, **When** I watch it, **Then** the transcript
   appears progressively, not only at the end.
3. **Given** the run finished, **When** I reload, **Then** its final status and
   full transcript are still there.
4. **Given** I try a host-local action in the hosted app, **When** it refuses,
   **Then** it explains this needs the machine directly.

---

### US4 — Understand what broke when a machine will not connect (Priority: P3)

*(Carried from v1 — inferred.)*

I can tell which thing is wrong: the code, the network, or the machine.

**Independent test:** force each failure in turn; confirm each message names
its actual cause.

**Acceptance scenarios:**

1. **Given** a paired machine, **When** I revoke it, **Then** its next request
   fails and its own status command says *revoked* and how to reconnect.
2. **Given** a machine pointed at an unreachable URL, **When** I run pairing or
   status, **Then** it says the control plane was unreachable and names the URL
   — distinct from "your code was wrong".
3. **Given** a code already redeemed, **When** I reuse it, **Then** I am told it
   was already used, specifically.
4. **Given** a code that expired, **When** I look at the panel, **Then** it says
   so and stops offering a dead code.

---

### US5 — The desktop app shows the deployed product (Priority: P3)

*(Carried from v1 — inferred.)*

**Independent test:** launch the desktop app with the app URL set; sign in
inside the window.

**Acceptance scenarios:**

1. **Given** the app URL is set, **When** I open the desktop app, **Then** it
   loads the deployed app and I can sign in inside it.
2. **Given** it is unset, **When** I open the desktop app, **Then** it behaves
   exactly as today — the local UI, not an error.
3. **Given** the app is unreachable, **When** I open it, **Then** I get a screen
   naming the URL and the real error, saying agents keep running, with a retry
   that works.

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| **Machines** (sidebar destination) | **new** — promoted out of Settings | Pair, see status, rename, revoke, remove |
| **Setup guide** | **new** | Follow steps: profile → workspace → machines |
| **Workspace naming** | **new** (decision 5) | Give the auto-created workspace a real name and slug |
| Settings → Workspace → General | existing | **Loses the Machines card entirely** (decision 4); gains the workspace-naming control, or the guide links to it — plan's call |
| Pairing command on the machine | existing CLI, never run against a deployment | Redeem a code; check status; understand failures |
| Run detail (live transcript) | existing, live half unproved | Watch work execute on the paired machine |
| Desktop window | existing, never launched | See the hosted product |

### The four states

Mandatory on both new surfaces.

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| **Machines** | Rows: status, name (inline rename), OS · hostname · core version, capability badges, per-machine controls | Explains what a machine is for; **Pair a machine** as primary action | Skeleton rows shaped like real rows | The real failure message in place, not a toast that vanishes |
| **Setup guide** | Steps with done / current / not-yet, and what each is for | n/a — never empty; a fresh account is the *fullest* case | Skeletons while real completion state resolves | A step whose state can't be read says so, rather than showing as not-done |

**The empty Machines state is the most important screen in this spec.** It is
what a brand-new owner sees, it is where the setup guide sends them, and it is
currently the screen that tells them to run a command they cannot run.

### Machine status vocabulary

**Two states this round** (decisions 1 and 2):

| State | Means | How we know |
|---|---|---|
| **Active** | Running and reachable | Heartbeat within the staleness window |
| **Unreachable** | Stopped talking — off, asleep, crashed or disconnected, and we do not know which | Silence past the staleness window. Always shown with a last-seen time |

Existing `draining` (shutting down) stays as it is. **Sleeping** joins this
table when [`D-16`](../Deferred.md) is unparked; nothing in this round should
make that harder to add.

### Flow

**Setup guide:** account created → guide appears → profile → workspace →
machines → guide stands down.

**Pairing, from the Machines menu:** Machines → **Pair a machine** → code with
countdown → run the steps on the machine → machine appears → status goes
active.

**Dead ends to check:** an expired code; a reused code; a machine that pairs
but is never started; a guide step completed elsewhere in the app.

## Edge cases

- What does the guide show for an account created before the guide existed —
  all steps done, or all steps unknown? (US2 scenario 8 says: reflect reality.)
- What happens when the code expires *while* the pairing command is running?
- Does a machine that paired but never started appear at all, or only after its
  first heartbeat?
- How long after a machine goes quiet does the page reflect it, and is that
  delay explained anywhere the owner would look?
- What does a run do when its machine goes unreachable mid-run?
- Can a machine be in two workspaces? What does the Machines page show then?
- What happens to a bookmark or link pointing at the removed Settings card?

## Requirements

### Functional requirements

- **FR-001**: Machines MUST be reachable as a top-level destination, in one
  click from anywhere in the app.
- **FR-002**: The Machines page MUST support pair, rename, revoke, and remove
  without navigating to Settings.
- **FR-003**: The owner MUST be able to generate a pairing code and see how
  long it remains valid.
- **FR-004**: A machine MUST redeem that code against the deployed app and
  store the credential without ever displaying it.
- **FR-005**: A paired machine MUST appear without a manual refresh, showing
  enough identity to tell it from another machine at a glance.
- **FR-006**: Each machine MUST show either **active** or **unreachable**, and
  MUST NOT assert a cause it cannot know. Unreachable MUST always carry a
  last-seen time.
- **FR-007**: The status model MUST leave room for **sleeping** to be added
  without reshaping it, since [`D-16`](../Deferred.md) will add it.
- **FR-008**: The Machines card MUST be removed from Settings → Workspace →
  General, with nothing orphaned by its removal.
- **FR-009**: The setup guide MUST derive every step's completion from real
  application state, never from a stored flag the app ticks separately.
- **FR-010**: The setup guide MUST be available to existing accounts, not only
  newly created ones, and MUST reflect what those accounts have already done.
- **FR-011**: The setup guide MUST stand down once setup is complete.
- **FR-012**: The setup guide MUST NOT gate access — every step is skippable.
- **FR-013**: The system MUST distinguish, in what it tells the owner, a
  rejected code from an unreachable control plane from a machine not running.
- **FR-014**: Revoking a machine MUST stop it reaching the workspace on its
  next request, and the machine MUST be able to say so about itself.
- **FR-015**: Every instruction the product prints MUST name a place that
  exists.
- **FR-016**: Instructions for connecting a machine MUST state plainly what is
  actually required today, including the dev checkout — the product must not
  imply a command that does not exist (decision 3).
- **FR-017**: The owner MUST be able to give their workspace a real name (and
  slug) from the app; today this is only ever set automatically, to
  `"Personal Workspace"`, with no surface to change it (decision 5).
- **FR-018**: The workspace setup step MUST read as done only once the
  workspace's name differs from its auto-generated default — a workspace's
  mere existence MUST NOT count, since every account has one automatically.

### Key entities

- **Machine (runtime)**: a computer that can run agents for this workspace. Has
  an owner-chosen name, self-reported identity, a reachability state, and a set
  of capabilities.
- **Pairing code**: short-lived, single-use secret joining one machine to one
  workspace.
- **Workspace**: the account's namespace, auto-created on first sign-in with a
  generated placeholder name. Has an owner-chosen name and slug once named.
- **Setup step**: one thing that must be true for the account to be usable.
  Derived from real state, never stored as a tick.
- **Run**: work started from the browser, executing on a machine, reporting
  back while it happens.

## Success criteria

- **SC-001**: A brand-new account reaches a paired, working machine using only
  what the app tells them — no source, no docs, no asking. *(Bounded by
  decision 3: the guide may honestly require a dev checkout; it may not be
  wrong about it.)*
- **SC-002**: Machines is reachable in one click from anywhere.
- **SC-003**: A machine's displayed state matches reality within a stated
  window, for both states, verified by forcing each deliberately.
- **SC-004**: The owner can pair, rename, revoke and remove a machine without
  opening Settings, and the Settings card is gone.
- **SC-005**: The setup guide's steps match reality when a step is completed
  elsewhere in the app, and on an account that predates the guide.
- **SC-006**: A run started in the browser executes on the paired machine with
  its transcript visible during execution.
- **SC-007**: `G-12` and `G-16` are closed, or their residue rewritten to say
  exactly what is still unproved.

## Assumptions

- **This spec is also the pending verification pass** — walking US3–US5 is
  [`T-M7-04`](../tasks/M7/T-M7-04-verification.md) sections C–D and the rest of
  `T-M3-08`. Close them in place.
- **Target is `staging.sparstrow.com`.** `main` is still dummy code
  ([`D-15`](../Deferred.md)).
- **Local agent/dev testing stays on `localhost:3000`.**
- **Two machine states this round**, per decision 2. Sleep detection and waking
  are both parked in [`D-16`](../Deferred.md).
- **Distribution is the next round**, per decision 3 — [`D-10`](../Deferred.md)
  gets its own spec once this one ships.
- **Out of scope, deliberately**: HITL gates ([`D-1`](../Deferred.md)),
  multi-workspace switching ([`D-7`](../Deferred.md)), agent-definition sync
  ([`D-9`](../Deferred.md)), the Realtime dispatch doorbell
  ([`D-12`](../Deferred.md)), sleep detection and waking
  ([`D-16`](../Deferred.md)), and machine distribution
  ([`D-10`](../Deferred.md), next round).

## Owner review

**Stories captured:** 2026-08-16 — US1 and US2 from the owner directly;
US3–US5 carried forward as inferred.

**Reviewed:** 2026-08-16 — **accepted, with five decisions** recorded above:
"unreachable" over "turned off", sleep detection deferred to `D-16`,
distribution sequenced as its own round after this one, the Settings Machines
card removed outright, and — added in a follow-up pass, same day, while
checking the plan was ready to start — the workspace setup step given a real
action (naming) rather than left decorative.

**What changed as a result:** the three-state status story was folded into US1
and reduced to two states, dropping the story count from six to five. The
setup guide gained three scenarios — honest wording about the dev checkout,
correct behaviour for accounts that predate it, and workspace naming as the
step's actual completion signal — consequences of decisions 3, 2, and 5
respectively. Decision 5 is genuinely new scope, flagged as such at decision 5
itself: workspace name/slug editing did not exist in any form before this
spec, in code or in the original ask.
