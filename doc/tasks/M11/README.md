# M11 — Walk the spec against staging

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-16-setup-and-machines.md`](../../plans/2026-08-16-setup-and-machines.md) (M11) |
| **Kind** | **serves US3, US4, US5** — and it is the verification pass three `KnownGaps` entries have been waiting for |
| **Spec** | [`../../specs/2026-08-16-setup-and-machines.md`](../../specs/2026-08-16-setup-and-machines.md) |
| **Depends on** | M8, M10, **and an owner action** (below) |
| **Blocks** | nothing. This is the plan's last phase. |
| **Status** | done-with-known-residue — 2026-08-22. See `T-M11-05`'s Result and `KnownGaps.md` (`G-12`/`G-13`/`G-16`/`G-27`) for exactly what remains |
| **Open questions** | none |

## The stories this serves

> **US3 — Send work from the browser and watch it run on that machine** (P2)
> From the deployed app I start a run. It executes on the machine I paired, not
> in the browser, and I watch it happen live.
>
> **US4 — Understand what broke when a machine will not connect** (P3)
> I can tell which thing is wrong: the code, the network, or the machine.
>
> **US5 — The desktop app shows the deployed product** (P3)

All three describe **already-built** behaviour. This phase ships almost no code;
it runs the thing and writes down what happened.

**Independent tests, from the spec:**

- US3 — queue one run from `staging.sparstrow.com`, watch its transcript while
  it executes on the paired machine.
- US4 — force each failure in turn; confirm each message names its actual cause.
- US5 — launch the desktop app with the app URL set; sign in inside the window.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-M11-01 — a machine on staging, and both states](T-M11-01-machine-on-staging.md) | `[S]` | US1/US3 | owner action | ✅ done (2026-08-22) |
| [T-M11-02 — a run, live](T-M11-02-run-live.md) | `[C]` | US3 | 01 | done except residue (2026-08-22) |
| [T-M11-03 — the four failure messages](T-M11-03-failure-messages.md) | `[C]` | US4 | 01 | ✅ done (2026-08-22) |
| [T-M11-04 — the desktop window](T-M11-04-desktop-window.md) | `[P]` | US5 | 01 | done except residue (2026-08-22) |
| [T-M11-05 — reconcile the gaps](T-M11-05-gap-reconciliation.md) | `[S]` | US3–US5 | 01–04 | ✅ done (2026-08-22) |

01 is `[S]` because nothing else can start without a machine paired to staging.
02 and 03 are `[C]` — both drive the same machine and the same workspace, so
they interleave but must not run simultaneously. 04 is `[P]`: a different
process on a different surface.

## Objective

Prove the spine works across a real network, end to end, for the first time.
M3, M4, M5, M6 and M7 all shipped code that has never been exercised against a
deployment — every daemon in this repo still defaults to `localhost:3000`
([`config.ts:138`](../../../packages/core/src/config.ts:138)).

Then close or honestly rewrite [`G-12`](../../KnownGaps.md),
[`G-13`](../../KnownGaps.md) and [`G-16`](../../KnownGaps.md), which is SC-007.

## The owner action this phase cannot do for itself

**A machine's `SPARSTROW_CLOUD_URL` and `SPARSTROW_APP_URL` must point at
`staging.sparstrow.com`.** Nothing is undecided — someone has to set two
environment variables on a machine and restart core.

It has a row in [`../../runbooks/README.md`](../../runbooks/README.md), which is
where the owner goes to act on it. Until it happens, **no task in this phase can
start**, and that is a hard block rather than a slow path. Procedure:
[`../../runbooks/deploy-web-app.md`](../../runbooks/deploy-web-app.md).

## What this phase is allowed to find

Every phase in this repo that ran against reality found defects reading the code
could not: M2 found nine, M4 found four, M5 found two design corrections. **This
phase should expect the same, and defects found here get bug files
(AGENTS.md §5), not silent fixes.** A verification pass that reports "everything
worked" on first contact with a real network is the one result worth
disbelieving.

Fixes that are small and obvious land here. Anything larger becomes a bug file
plus a task, and this phase reports as done-with-known-bugs rather than being
held open.

## Definition of done

- US3, US4 and US5's acceptance scenarios each either **pass** or have a
  `KnownGaps.md` entry naming exactly what blocked them.
- A run started in a browser on `staging.sparstrow.com` executed on a real
  machine and its transcript was visible **during** execution, not only after.
- Both machine states observed against staging, each forced deliberately.
- `G-12`, `G-13` and `G-16` closed, or rewritten down to precisely what remains
  unproved. Leaving them untouched is not an outcome (SC-007).
- Any defect found is a file in [`../../bug/`](../../bug/README.md) or
  [`../../security/`](../../security/README.md), written in the turn it
  surfaced.
- The plan's Status row and Result section filled in.

**Not in this phase:** building anything US3–US5 turns out to be missing. If a
scenario fails because a feature does not exist, that is a bug file and a new
task, not scope absorbed here.

---

## Decisions already made

### 1. Staging, not production

`main` is dummy code with no environment variables
([`D-15`](../../Deferred.md)). Every assertion in this phase targets
`staging.sparstrow.com`.

### 2. The daemon keeps `localhost:3000` as its default

Only the machine used for this pass is repointed, by environment variable.
Changing the default in `config.ts` would break every local dev loop in the
repo, including the one an agent uses to run tests.

### 3. Defects get filed before they get fixed

AGENTS.md §5: document a bug in the same turn it surfaces. A pass that fixes
six things and mentions them only in a summary leaves the next session with no
record of what was wrong or why the fix looks the way it does.

### 4. Network-disruptive assertions are the owner's call

`G-13`'s 60-second network cut was deliberately withheld in M5 pending the
owner's say-so, and that stands. If the owner is present and agrees, run it
here and close that half of `G-13`; otherwise leave it recorded.

---

## Files

Mostly not code. What this phase writes:

| Path | Change |
|---|---|
| `doc/KnownGaps.md` | edit — `G-12`, `G-13`, `G-16` closed or rewritten |
| `doc/bug/BUG-*.md` | new — one per defect found |
| `doc/tasks/M3/T-M3-08-verification.md` | edit — residue ticked or annotated |
| `doc/tasks/M7/T-M7-04-verification.md` | edit — sections C–D ticked or annotated |
| `doc/plans/2026-08-16-setup-and-machines.md` | edit — Status and Result |
| `packages/ui/src/content/knowledge/*.md` | edit — whatever this pass proves false |

## Traps

**A passing run does not prove the transcript path.** M4's verification proved
a run reaches `succeeded`; M5's transcript half has never been seen. They are
separate assertions and a green run status is not evidence for the second.

**"It worked on localhost" is not evidence for staging.** The whole point of
this phase is the network between them — TLS, cold starts, Vercel's function
timeouts, Realtime's cross-origin behaviour. Re-running a local pass and
reporting it as this one is the failure this phase exists to prevent.

**Do not shorten `HEARTBEAT_STALE_AFTER_MS` to make a test faster.** A
shortened constant proves a different system. Stop the machine and wait 90
seconds.

**Revoking a machine mid-pass breaks the later tasks.** T-M11-03 revokes a
token deliberately. Run it last among 02/03, or re-pair afterwards.

## Verification

This phase *is* the verification. Its per-task checklists are the procedure;
[T-M11-05](T-M11-05-gap-reconciliation.md) is where the outcome gets written
down.
