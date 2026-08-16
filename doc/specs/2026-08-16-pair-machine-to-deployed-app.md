# Spec: Pair a machine to the deployed app

| | |
|---|---|
| **Status** | **Draft — needs owner review.** Stories below are drafted by inference and must be corrected before planning starts |
| **Created** | 2026-08-16 |
| **Trigger** | Owner: "let's come to the verification part and pairing the app", after deploying `staging.sparstrow.com` |
| **Plan** | not planned yet — blocked on owner review |
| **Open questions** | 3 inline `[NEEDS CLARIFICATION]`, see Assumptions |

> **Why this spec exists rather than just running the pending verification
> task.** Almost everything below is already built. What has never happened is
> anyone *using* it against a real deployed app — so the acceptance scenarios
> in this document **are** the verification pass that
> [`G-12`](../KnownGaps.md) and [`G-16`](../KnownGaps.md) have been waiting
> for. Writing it as a spec rather than a checklist means it gets graded on
> whether the owner can pair a machine, not on whether the endpoints respond.

## The experience today

**Nobody has ever paired a machine against a deployed app.** Every daemon
still defaults to `http://localhost:3000` ([`config.ts:138`](../../packages/core/src/config.ts:138)),
so pairing has only ever worked because the app happened to be running on the
same computer. `staging.sparstrow.com` went live on 2026-08-16 and no machine
points at it.

Four things are true about today's experience, all verified in code rather
than assumed:

**The web half is built and looks good on paper.** [`runtimes-card.tsx`](../../packages/ui/src/components/runtimes-card.tsx)
already has all four states — skeletons while loading, a dashed empty panel
that explains what pairing *is* and offers the button, populated rows with a
live online dot, and an error line if the code request fails. The code panel
counts down, copies, shows the exact command, and retires itself the moment a
machine appears. This is careful work.

**But it has never been looked at.** `G-12` records it plainly: the browser
pane could not composite frames, so *"the blocked-task affordance and the
Machines-card switch have never been looked at"*. Every endpoint underneath
was exercised through a real session; no rendered pixel was ever seen. M2's
browser pass found a hook-order crash and a whole class of dead Tailwind
utilities that no API test could see — which is exactly why "it is built" is
not the same claim as "it works".

**The command the UI tells you to run does not exist on a fresh machine.** The
empty state and the code panel both say to run `sparstrow pair <code>`. Per
[`D-10`](../Deferred.md), `sparstrow` is published nowhere — `@sparstrow/core`
is `private: true` and 404s against npm. The only way to run that command is
to clone this monorepo, `pnpm install`, and start core from a dev checkout.
For the owner on their own dev box that is a non-issue. For the sentence the
product prints on screen, it is a promise the product cannot keep.

**The CLI sends you to a tab that does not exist.** `pair --help` and the
"getting a code" text both say *Settings → Workspace → **Runtimes***. There is
no Runtimes tab: the card is titled **Machines** and lives under Settings →
Workspace → **General** ([`settings.tsx:777`](../../packages/ui/src/routes/pages/settings.tsx:777)).
Filed as [`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md).

## What I expect instead

I can take a computer, connect it to the app I just deployed, and see it come
alive in the browser — then send it work from the browser and watch it run.
When it goes wrong, the app tells me which of the three things broke: the
code, the network, or the machine.

---

## User stories

> ⚠️ **Drafted by inference, not dictated by the owner.** These are assembled
> from the pending runbook row, `G-12`/`G-16`, and what the code actually
> does. Correct them at review — especially the priorities.

### US1 — Pair my machine to the deployed app and watch it come online (Priority: P1)

I open `staging.sparstrow.com` in a browser, go to my workspace settings, and
press **Pair a machine**. I get a short code with a countdown. On the computer
I want to connect, I run one command with that code. Within a few seconds the
browser shows that machine in the list with a green dot, its real name, and
what it can run — without me refreshing the page.

**Why this priority:** nothing else in this spec is reachable without it, and
it is the first moment the deployment is more than a URL that loads. It is
also the whole of `M3`, finally exercised the way it was designed to be.

**Independent test:** pair one machine against `staging.sparstrow.com` and see
it listed as online. Delivers value alone — a machine that shows online is
proof the daemon, the token, the heartbeat and the deployment all agree.

**Acceptance scenarios:**

1. **Given** a workspace with no machines paired, **When** I open Settings →
   Workspace, **Then** I see an empty state that explains what pairing is for
   and offers a **Pair a machine** button — not a bare "No items".
2. **Given** I press **Pair a machine**, **When** the code appears, **Then** I
   see the code, a live countdown, a copy button, and the exact command to run
   on the other machine.
3. **Given** a valid unexpired code, **When** I run the pairing command on a
   machine pointed at `staging.sparstrow.com`, **Then** it reports success
   naming the workspace, and the token is never printed.
4. **Given** that machine has started core, **When** I look at the browser
   without refreshing, **Then** the machine appears with a green dot, its
   hostname, OS, core version, and its providers as badges.
5. **Given** the code has already been redeemed once, **When** I try the same
   code on a second machine, **Then** it is refused with a message saying the
   code was already used — not a generic failure.
6. **Given** the code's countdown reaches zero, **When** I look at the panel,
   **Then** it tells me the code expired and to generate another, and the
   panel stops offering a dead code.

---

### US2 — Send work from the browser and watch it run on that machine (Priority: P2)

From the deployed app I start a run against an agent. The run does not execute
in the browser — it executes on the machine I paired — and I can watch it
happen from the browser, live.

**Why this priority:** pairing that leads nowhere proves plumbing, not a
product. This is the first time the whole spine — dispatch, claim, execute,
transcript — runs across a real network rather than one computer talking to
itself. It is also the only thing that closes the live half of
[`G-13`](../KnownGaps.md).

**Independent test:** queue one run from `staging.sparstrow.com` and watch its
transcript appear while it executes on the paired machine.

**Acceptance scenarios:**

1. **Given** a machine showing online, **When** I start a run from the browser,
   **Then** it begins on that machine within a few seconds without my touching
   the machine.
2. **Given** a run is executing, **When** I watch the run page, **Then** its
   transcript appears progressively rather than only at the end.
3. **Given** the run finishes, **When** I look at the run, **Then** its final
   status and full transcript are there after a page reload — not only in the
   live stream.
4. **Given** I try a host-local action (terminal, git, local files) in the
   hosted app, **When** it refuses, **Then** it explains that this needs the
   machine directly, rather than failing silently or looking broken.

---

### US3 — Understand what broke, when a machine will not connect (Priority: P3)

When a machine is not reachable, I can tell from the app *which* thing is
wrong: the code was bad, the network could not reach the app, or the machine
is switched off or revoked. I never have to guess.

**Why this priority:** this is where trust is won or lost, and it is the part
that only reveals itself on a real network — localhost never fails. The CLI
already models it carefully (distinct exit codes per failure), so this story
is mostly *proving* a design that exists.

**Independent test:** force each failure in turn and confirm the message names
the actual cause.

**Acceptance scenarios:**

1. **Given** a machine that was online, **When** I stop core on it, **Then**
   the browser stops showing it as online and shows when it was last seen.
2. **Given** a paired machine, **When** I revoke it in the browser, **Then**
   its very next request fails, and its own status command says *revoked* and
   tells me how to reconnect.
3. **Given** a machine pointed at an unreachable URL, **When** I run the
   pairing or status command, **Then** it says the control plane could not be
   reached and names the URL it tried — distinct from "your code was wrong".
4. **Given** an offline machine, **When** I look at its per-machine settings,
   **Then** the controls are disabled with the reason shown, rather than
   letting me change a setting on a computer that is switched off.

---

### US4 — Open the desktop app and get the deployed product (Priority: P3)

I launch the desktop app on the paired machine and it shows me the same app I
see in the browser, signed in, rather than its own local copy.

**Why this priority:** genuinely optional for proving the system — US1–US3
carry the value. It is here because `SPARSTROW_APP_URL` has shipped and been
verified as logic only; no window has ever been opened
([`G-16`](../KnownGaps.md)).

**Independent test:** launch the desktop app with the variable set and sign in
inside the window.

**Acceptance scenarios:**

1. **Given** the app URL variable is set to the deployed app, **When** I open
   the desktop app, **Then** the window loads it and I can sign in inside it.
2. **Given** the variable is unset, **When** I open the desktop app, **Then**
   it behaves exactly as it does today — the local UI, not an error.
3. **Given** the app cannot be reached, **When** I open the desktop app,
   **Then** I get a screen naming the URL and the real error, telling me
   agents keep running, with a retry that works.

## Interface & experience

### Surfaces

| Surface | New or existing | What the owner does here |
|---|---|---|
| Settings → Workspace → General → **Machines** | existing, never seen rendered | Generate a code, watch a machine appear, rename/revoke/remove it |
| The pairing command on the machine | existing CLI, never run against a deployment | Redeem a code; check status; understand failures |
| Run detail (live transcript) | existing, live half unproved | Watch work execute on the paired machine |
| Desktop window | existing, never launched | See the hosted product instead of the local UI |

### The four states

The Machines card already implements all four. This spec's job is to confirm
they are *right when seen*, not to build them.

| State | What the owner sees |
|---|---|
| **Populated** | Rows with a live status dot, machine name (click to rename), OS · hostname · core version, provider badges, and revoke/remove actions |
| **Empty** | A dashed panel: what pairing is for, and the **Pair a machine** button — already written this way, needs confirming on screen |
| **Loading** | Two skeleton rows shaped like real machine rows |
| **Error** | The code request failure printed in place with its real message, not a toast that disappears |

**The state that matters most here is empty**, because it is the only one the
owner sees before anything works — and it is the state that tells them to run
a command that does not exist on a machine without a monorepo clone.

### Flow

1. Browser: Settings → Workspace → General → Machines → **Pair a machine**
2. Code appears with a countdown; copy it
3. Machine: point it at the deployed app, run the pairing command with the code
4. Machine: start core
5. Browser: the machine appears online, without a refresh
6. Browser: start a run → it executes on that machine → transcript streams back

**Dead ends to check:** an expired code (step 2 → 3 too slow), a reused code
(two machines, one code), a machine that pairs but is never started (step 3
without step 4 — does the browser show anything at all?).

## Edge cases

- What happens when the code expires *while* the pairing command is running?
- What does the browser show for a machine that paired successfully but whose
  core was never started — does it appear at all, or is it invisible until the
  first heartbeat?
- What happens if the same machine pairs twice, once per workspace?
- How long after a machine goes offline does the browser reflect it, and is
  that delay explained anywhere the owner would look?
- What does a run do when its target machine goes offline mid-run?
- What happens when the machine's clock is wrong enough to affect a 10-minute
  code window?

## Requirements

### Functional requirements

- **FR-001**: The owner MUST be able to generate a pairing code from the
  deployed app and see how long it remains valid.
- **FR-002**: A machine MUST be able to redeem that code against the deployed
  app and store the resulting credential without ever displaying it.
- **FR-003**: A paired machine MUST appear in the browser as online without a
  manual refresh, showing enough identity to tell it apart from another
  machine at a glance.
- **FR-004**: The system MUST distinguish, in what it tells the owner, between
  a rejected code, an unreachable control plane, and a machine that is simply
  not running.
- **FR-005**: The owner MUST be able to start work from the browser and have it
  execute on a paired machine, with the transcript visible while it runs.
- **FR-006**: Revoking a machine in the browser MUST stop it reaching the
  workspace on its next request, and the machine MUST be able to say so about
  itself.
- **FR-007**: Every instruction the product prints MUST name a place that
  exists — the settings path in the CLI is currently wrong
  ([`BUG-2026-08-16-pairing-path-wrong-in-cli`](../bug/BUG-2026-08-16-pairing-path-wrong-in-cli.md)).
- **FR-008**: The pairing instruction shown in the app MUST be runnable on the
  machine the owner is pairing.
  [NEEDS CLARIFICATION: today this requires a monorepo clone per `D-10`. Does
  this round fix distribution, or does the wording change to tell the truth
  about the dev-checkout path? See Assumptions.]

### Key entities

- **Machine (runtime)**: a computer that can run agents for this workspace.
  Has a name the owner chooses, an identity it reports about itself, a live
  reachability state, and a set of things it can run.
- **Pairing code**: a short-lived, single-use secret that lets one machine join
  one workspace.
- **Run**: work started from the browser that executes on a machine and reports
  back while it happens.

## Success criteria

- **SC-001**: The owner can pair a machine to the deployed app in under five
  minutes, starting from a browser and a terminal, without reading the source.
- **SC-002**: A paired machine's status in the browser matches reality within
  ~90 seconds of it changing (core's heartbeat staleness window).
- **SC-003**: For each of the three failure causes, the message names the
  actual cause — verified by forcing all three deliberately.
- **SC-004**: A run started in the browser executes on the paired machine, and
  its transcript is visible during execution, not only after.
- **SC-005**: `G-12`'s never-rendered Machines card and `G-16`'s never-launched
  desktop shell are both closed, or their residue is rewritten to say exactly
  what is still unproved.

## Assumptions

- **The verification pass and this spec are the same activity.** Walking these
  acceptance scenarios *is* the pending work in
  [`T-M7-04`](../tasks/M7/T-M7-04-verification.md) sections C–D and the
  outstanding half of `T-M3-08`. Any plan should close those in place rather
  than creating parallel checklists.
- **Target is `staging.sparstrow.com`, not production.** `main` is still dummy
  code with no Supabase project ([`D-15`](../Deferred.md)).
- **Local agent/dev testing stays on `localhost:3000`** and is untouched by
  this — the 11 localhost redirect URLs exist for exactly that.
- [NEEDS CLARIFICATION: **how many machines?** US1–US3 need one. `G-12`'s
  reassign corner and `G-15`'s memory-sync corner need a *second* paired
  machine. Is a second machine available for this round, or do those gaps stay
  open and get restated?]
- [NEEDS CLARIFICATION: **does this round fix `D-10` distribution?** Making
  `sparstrow pair` runnable without cloning the monorepo is a real piece of
  work (a published build, service registration per OS, native module
  packaging). Options: (a) accept the dev-checkout path and change the app's
  wording to match, (b) unpark `D-10` and build distribution as part of this.
  This roughly doubles the scope, so it is the owner's call — it is not a
  detail a plan should absorb silently.]
- [NEEDS CLARIFICATION: **is the desktop app (US4) in scope now**, or does it
  wait until the web half is proved? It is genuinely separable.]
- **Out of scope, deliberately**: HITL gates ([`D-1`](../Deferred.md)),
  multi-workspace switching ([`D-7`](../Deferred.md)), agent-definition sync
  ([`D-9`](../Deferred.md)), and the Realtime dispatch doorbell
  ([`D-12`](../Deferred.md)). None is needed to pair a machine and run work on
  it.

## Owner review

**Reviewed:** — *not yet reviewed*

<!--
At review, the three [NEEDS CLARIFICATION] items above are the decisions worth
your time — especially D-10 distribution, which is the difference between a
one-week pass and a three-week one. Everything else can be corrected in place.
-->
