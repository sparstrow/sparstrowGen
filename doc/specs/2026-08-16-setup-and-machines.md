# Spec: Getting set up, and a home for my machines

| | |
|---|---|
| **Status** | **Draft v2 — owner stories captured 2026-08-16, open questions below** |
| **Created** | 2026-08-16 |
| **Trigger** | Owner, after deploying `staging.sparstrow.com`: a dedicated Machines menu with CRUD and live status, and an interactive step-by-step setup guide |
| **Plan** | not planned yet — blocked on the open questions |
| **Open questions** | 4 inline `[NEEDS CLARIFICATION]`, see Assumptions |

> **Scope widened from v1.** This started as "pair a machine to the deployed
> app". The owner's stories make it one journey: **from a fresh account to a
> machine that runs work.** Setup, machines, pairing and status are steps in
> that journey, not separate features. Renamed from
> `2026-08-16-pair-machine-to-deployed-app.md` to match.

> **This spec is also the pending verification pass.** Almost everything under
> US4–US6 is already built and has never been *used* against a real
> deployment. Walking those acceptance scenarios is exactly what
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
So the thing every agent run depends on is three clicks deep, in a settings
page, next to unrelated controls.

**Status is binary, not three-state.** A machine reads `online` or `offline`,
derived purely from heartbeat age — 90 seconds of silence and it flips
([`cloud.ts:35-52`](../../packages/shared/src/cloud.ts:35)). There is no
concept of sleeping. See the finding below; this is the part of the owner's
ask that is not free.

**The card itself is good, and has never been seen.** All four states are
already implemented — skeletons, a dashed empty panel that explains pairing,
populated rows with a live dot, and an inline error. It has never been
rendered in a browser ([`G-12`](../KnownGaps.md)).

**Nobody has ever paired against a deployed app.** Every daemon still defaults
to `localhost:3000` ([`config.ts:138`](../../packages/core/src/config.ts:138)).

**Two defects found while writing this spec:**

- The CLI sends users to *Settings → Workspace → **Runtimes***, a tab that
  does not exist — [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md).
  A dedicated Machines menu (US1) changes this instruction anyway.
- The command the UI tells you to run, `sparstrow pair <code>`, cannot be run
  on a machine without cloning this monorepo — `sparstrow` is published
  nowhere ([`D-10`](../Deferred.md)). The product prints a promise it cannot
  keep.

---

## ⚠️ Finding: "sleeping" and "turned off" look identical from the cloud

The owner asked for three states — **active, sleeping, turned off**. Two of
them are free; the third is not, and it is worth knowing before planning.

Liveness today is derived entirely from heartbeat age. **A sleeping machine
and a powered-off machine both stop heartbeating.** The cloud sees the same
thing in both cases: silence. Nothing in the current design can tell them
apart, and no amount of UI work changes that.

To know a machine is *sleeping*, the machine must **say so before it goes
quiet** — catch the OS suspend event and report it. That is buildable:
Electron 36 ships `powerMonitor` with `suspend`/`resume` events, and it is
currently unused anywhere in `packages/desktop` (verified). Headless core
would need a per-OS equivalent.

**But even then, one case stays ambiguous forever.** A machine that loses
power, crashes, force-shuts-down, or drops off wifi goes quiet *without*
announcing anything — exactly like a machine that was switched off. So the
honest third state is **"unreachable"**, meaning *"it stopped talking and did
not say why"*, not "turned off".

Calling that state "turned off" would be the product asserting something it
does not know. Given the owner's own standard elsewhere — the offline machine
switch that refuses rather than pretending, the CLI's three distinct exit
codes — I think honesty wins here, but it is the owner's call. See
`[NEEDS CLARIFICATION]` in Assumptions.

*(One wrinkle in our favour: Windows Modern Standby machines keep networking
alive in sleep, so some machines may keep heartbeating while asleep and never
need this at all.)*

---

## What I expect instead

I open the app on a fresh account and it walks me through getting set up, step
by step, telling me what is still unfinished. Machines get a menu of their
own, where I can pair one, see everything connected, tell at a glance whether
each is working, asleep, or gone, and manage them without hunting through
settings.

---

## User stories

> **US1–US3 are the owner's own words, captured 2026-08-16.** US4–US6 are
> carried forward from v1 and remain drafted by inference — correct those.

### US1 — Machines get a menu of their own (Priority: P1)

Machines are a first-class destination in the sidebar, not a card buried in
settings. I open it and see every machine connected to my workspace, what each
one is doing, and I can pair a new one or manage an existing one from there —
rename it, revoke it, remove it — without leaving the page.

**Why this priority:** every agent run needs a machine, so the thing the whole
product depends on should not be three clicks deep next to unrelated settings.
It is also where the owner's other stories land: status (US2) and the setup
guide's final step (US3) both point here.

**Independent test:** open the Machines menu on `staging.sparstrow.com` and
pair a machine from it end to end, never opening Settings.

**Acceptance scenarios:**

1. **Given** I am signed in, **When** I look at the sidebar, **Then** there is
   a Machines destination, and I can reach it in one click from anywhere.
2. **Given** I open Machines with none paired, **When** the page loads,
   **Then** it explains what a machine is for and offers **Pair a machine** as
   the primary action — the empty state teaches the surface.
3. **Given** I press **Pair a machine**, **When** the code appears, **Then** I
   see the code, a live countdown, a copy button, and the exact command to run
   on the machine, naming a place that actually exists.
4. **Given** a machine finishes pairing, **When** I look at the page without
   refreshing, **Then** it appears in the list.
5. **Given** a machine in the list, **When** I rename it, **Then** the new name
   sticks and is what I see everywhere that machine is named.
6. **Given** a machine in the list, **When** I revoke or remove it, **Then** I
   am told the difference before confirming, and the result matches what I was
   told.
7. **Given** I am on the Machines page, **When** I complete any of the above,
   **Then** I never had to open Settings.

---

### US2 — Tell at a glance whether a machine is working, asleep, or gone (Priority: P1)

Each machine shows its real state. If it is running and reachable, I see that.
If it went to sleep, I see that — distinctly, because sleeping is recoverable
and gone is not. If it stopped talking without warning, I see that too, and
the app does not pretend to know why.

**Why this priority:** the owner asked for it directly, and it is the
difference between a list of names and a page that tells you something. It is
`[NEEDS CLARIFICATION]`-gated on the finding above — see Assumptions.

**Independent test:** put a machine into each state deliberately and confirm
the page says the right thing within a predictable time.

**Acceptance scenarios:**

1. **Given** a machine running and heartbeating, **When** I look at it,
   **Then** it reads as active, with what it can run.
2. **Given** a machine I put to sleep, **When** I look at it, **Then** it reads
   as sleeping — not the same as gone — and says when it went to sleep.
3. **Given** a machine that stopped without warning (power cut, crash, network
   dropped), **When** I look at it, **Then** it reads as unreachable and says
   when it was last seen, without claiming to know the cause.
4. **Given** any machine's state changes, **When** I have the page open,
   **Then** it updates without me refreshing, within a predictable window I
   could be told about.
5. **Given** a machine that is not active, **When** I try a control that needs
   it, **Then** the control refuses with the reason rather than queuing
   silently — the existing behaviour, preserved.

---

### US3 — A setup guide that shows me what is left (Priority: P1)

When I create an account — or come back to one that is half-finished — the app
shows me what still needs doing to be set up, in order, and walks me through
it. Profile, then workspace, then machines. I can tell at a glance how far
along I am, and pick up where I left off.

**Why this priority:** the owner asked for it directly, and it is the only
story here that serves someone who is not already an expert in this product.
It is also what makes US1 and US2 discoverable rather than things you have to
already know about.

**Independent test:** create a fresh account and reach a paired, working
machine using only what the guide tells you.

**Acceptance scenarios:**

1. **Given** I have just created an account, **When** I land in the app,
   **Then** I am shown the setup steps and which one is next — not an empty
   dashboard.
2. **Given** I am partway through setup, **When** I return later, **Then** the
   guide shows completed steps as done and points me at the next one.
3. **Given** I complete a step elsewhere in the app (say I pair a machine from
   the Machines menu), **When** I look at the guide, **Then** that step reads
   as done — it reflects real state, never a separate checkbox I have to tick.
4. **Given** I am fully set up, **When** I look, **Then** the guide is not in
   my way — it stands down rather than nagging.
5. **Given** a step cannot be completed yet (something is unavailable),
   **When** I reach it, **Then** it says so and why, rather than failing when
   I click.
6. **Given** I want to skip ahead, **When** I try, **Then** I can — the guide
   is a guide, not a gate.
   [NEEDS CLARIFICATION: is any step genuinely mandatory before the app is
   usable, or is all of it skippable? See Assumptions.]

---

### US4 — Send work from the browser and watch it run on that machine (Priority: P2)

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

### US5 — Understand what broke when a machine will not connect (Priority: P3)

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

### US6 — The desktop app shows the deployed product (Priority: P3)

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
| Settings → Workspace → General | existing | Loses the Machines card, or keeps a link to it [NEEDS CLARIFICATION] |
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

Three states, pending the naming decision in Assumptions:

| State | Means | How we know |
|---|---|---|
| **Active** | Running and reachable | Recent heartbeat |
| **Sleeping** | Suspended, expected back | The machine announced it before going quiet |
| **Unreachable** | Stopped talking, cause unknown | Silence with no announcement — covers off, crashed, and network-dropped |

Existing `draining` (shutting down) stays as it is.

### Flow

**Setup guide:** account created → guide appears → profile → workspace →
machines → guide stands down.

**Pairing, from the Machines menu:** Machines → **Pair a machine** → code with
countdown → run the command on the machine → machine appears → status goes
active.

**Dead ends to check:** an expired code; a reused code; a machine that pairs
but is never started; a guide step completed elsewhere in the app.

## Edge cases

- What does the guide show for an account created before the guide existed —
  all steps done, or all steps unknown?
- What happens when the code expires *while* the pairing command is running?
- Does a machine that paired but never started appear at all, or only after
  its first heartbeat?
- How long after a machine sleeps or dies does the page reflect it, and is that
  delay explained anywhere the owner would look?
- What does a run do when its machine sleeps or dies mid-run?
- Can a machine be in two workspaces? What does the Machines page show then?
- What does the guide do when a step's prerequisite is deferred or disabled —
  e.g. a machine cannot be paired because distribution isn't solved?

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
- **FR-006**: Each machine MUST show one of three states — active, sleeping,
  unreachable — and MUST NOT assert a cause it cannot know.
- **FR-007**: A machine MUST announce suspension before going quiet, so
  sleeping is distinguishable from unreachable.
  [NEEDS CLARIFICATION: headless core has no `powerMonitor`; is this
  desktop-only for now?]
- **FR-008**: The setup guide MUST derive every step's completion from real
  application state, never from a stored flag the app ticks separately.
- **FR-009**: The setup guide MUST be available to existing accounts, not only
  newly created ones.
- **FR-010**: The setup guide MUST stand down once setup is complete.
- **FR-011**: The system MUST distinguish, in what it tells the owner, a
  rejected code from an unreachable control plane from a machine not running.
- **FR-012**: Revoking a machine MUST stop it reaching the workspace on its
  next request, and the machine MUST be able to say so about itself.
- **FR-013**: Every instruction the product prints MUST name a place that
  exists.
- **FR-014**: The pairing instruction shown in the app MUST be runnable on the
  machine being paired.
  [NEEDS CLARIFICATION: today this needs a monorepo clone per `D-10` — fix
  distribution, or change the wording to tell the truth?]

### Key entities

- **Machine (runtime)**: a computer that can run agents for this workspace. Has
  an owner-chosen name, self-reported identity, a reachability state, and a set
  of capabilities.
- **Pairing code**: short-lived, single-use secret joining one machine to one
  workspace.
- **Setup step**: one thing that must be true for the account to be usable.
  Derived, never stored as a tick.
- **Run**: work started from the browser, executing on a machine, reporting
  back while it happens.

## Success criteria

- **SC-001**: A brand-new account reaches a paired, working machine using only
  what the app tells them — no source, no docs, no asking.
- **SC-002**: Machines is reachable in one click from anywhere.
- **SC-003**: A machine's displayed state matches reality within a stated
  window, for all three states, verified by forcing each deliberately.
- **SC-004**: The owner can pair, rename, revoke and remove a machine without
  opening Settings.
- **SC-005**: The setup guide's steps match reality when a step is completed
  elsewhere in the app.
- **SC-006**: A run started in the browser executes on the paired machine with
  its transcript visible during execution.
- **SC-007**: `G-12` and `G-16` are closed, or their residue rewritten to say
  exactly what is still unproved.

## Assumptions

- **This spec is also the pending verification pass** — walking US4–US6 is
  [`T-M7-04`](../tasks/M7/T-M7-04-verification.md) sections C–D and the rest of
  `T-M3-08`. Close them in place.
- **Target is `staging.sparstrow.com`.** `main` is still dummy code
  ([`D-15`](../Deferred.md)).
- **Waking a sleeping machine is deferred** at the owner's instruction —
  [`D-16`](../Deferred.md). US2 only *reports* sleep; it does not act on it.
- **Local agent/dev testing stays on `localhost:3000`.**
- [NEEDS CLARIFICATION: **what do we call the third state?** "Unreachable" is
  honest — the app genuinely cannot tell a powered-off machine from a crashed
  or disconnected one. "Turned off" is what was asked for and reads more
  plainly, but asserts a cause we don't know. Recommendation: "unreachable",
  with the last-seen time doing the explaining.]
- [NEEDS CLARIFICATION: **does sleep detection ship desktop-only first?**
  Electron's `powerMonitor` gives it nearly free for the desktop app; headless
  core needs a per-OS mechanism. Desktop-only means machines running headless
  core show unreachable when asleep, which is honest but less useful.]
- [NEEDS CLARIFICATION: **does this round fix `D-10` distribution?** Making
  `sparstrow pair` runnable without cloning the monorepo is real work — a
  published build, per-OS service registration, native module packaging.
  Otherwise the setup guide's machines step ends at "clone a monorepo", which
  undercuts US3's whole point. Roughly doubles scope; the owner's call.]
- [NEEDS CLARIFICATION: **does the Settings → Workspace Machines card stay?**
  Removing it is cleaner; leaving both is two places to maintain. A link from
  Settings to the new page is the middle option.]
- **Out of scope, deliberately**: HITL gates ([`D-1`](../Deferred.md)),
  multi-workspace switching ([`D-7`](../Deferred.md)), agent-definition sync
  ([`D-9`](../Deferred.md)), the Realtime dispatch doorbell
  ([`D-12`](../Deferred.md)), and waking a sleeping machine
  ([`D-16`](../Deferred.md)).

## Owner review

**Stories captured:** 2026-08-16 — US1, US2, US3 from the owner directly;
US4–US6 carried forward as inferred.

**Reviewed:** — *pending the four open questions above*
