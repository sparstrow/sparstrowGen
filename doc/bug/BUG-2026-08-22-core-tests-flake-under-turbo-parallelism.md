# BUG-2026-08-22-core-tests-flake-under-turbo-parallelism

**Status:** 🟠 partially fixed 2026-08-24 — the sub-default override is gone; the contention tail is not (see Second fix)
**Reported by:** agent — surfaced while gathering repeat-run evidence for
[`BUG-2026-08-20-flaky-realtime-live-events-test`](BUG-2026-08-20-flaky-realtime-live-events-test.md)
on `fix/flaky-realtime-test`; unrelated to that fix or to `apps/web`
**Reported:** 2026-08-22

## Symptom

Running `pnpm test --force` (or `--force --continue=always`) at the repo root
— i.e. through `turbo run test` with all five workspace suites executing
concurrently — intermittently fails a large batch of `@sparstrow/core` tests
with `Error: Test timed out in 5000ms.`, spread across several unrelated
files: `src/graph/graph-client.test.ts`, `src/graph/graph-lifecycle.test.ts`,
`src/graph/graph-tools.test.ts`, `src/graph/viz-manager.test.ts`,
`src/orchestrator/run-manager-finalize.test.ts`, `src/projects/git-status.test.ts`,
`src/projects/host-fs.test.ts`, `src/projects/variants.test.ts`,
`src/api/routes/host-fs.test.ts`, `src/api/routes/skills.test.ts`.

## Reproduction

Two consecutive `pnpm test --force --continue=always` runs from the repo root
on 2026-08-22 (branch `fix/flaky-realtime-test`, based on
`origin/development` at `17a1e81`):

- Run 1 (no `--continue`): `@sparstrow/core#test` failed after 156.07s with 2
  failed / 673 passed / 4 skipped — both failures were
  `src/api/routes/skills.test.ts` timeouts.
- Run 2 (`--continue=always`): `@sparstrow/core#test` failed with **25 failed
  / 650 passed / 4 skipped**, spanning the ten files listed above, all
  `Test timed out in 5000ms.`

Three further full-suite runs in the same session did not reproduce this
(the `@sparstrow/core` suite is not part of this bug's own repeat-run
evidence, so it wasn't tracked pass/fail on those). Not investigated further
— out of scope for the task in progress (fixing the `apps/web` realtime-test
flake), and touching `@sparstrow/core`'s test files was outside this agent's
assigned territory for this round.

## Investigation

Not done. Worth noting for whoever picks this up: the existing
`BUG-2026-08-20-flaky-realtime-live-events-test` report already names
`@sparstrow/core`'s 81 test files as including "several that spawn real `git`
processes" as the source of turbo-parallel contention — this may be the same
root cause (five-way concurrent load) manifesting as outright timeouts in
`@sparstrow/core` itself rather than merely starving `apps/web`'s first test.
The specific files affected (graph client pool, graph lifecycle indexing, viz
manager child processes, run-manager finalize, git-status, host-fs) share a
pattern of spawning real child processes or touching the filesystem/git —
consistent with resource contention rather than a logic bug, but that is an
inference, not yet verified against log evidence per `AGENTS.md` §3.4.

## Impact

Same shape as `BUG-2026-08-20`: an unreliable `pnpm test` gate that teaches
whoever hits it to re-run rather than investigate, undermining the
"verification before PR" rule in `AGENTS.md` §2.3. Wider blast radius than
the realtime-events flake — ten files and up to 25 tests in one run, all in
`@sparstrow/core`, the package most agents' work depends on for typecheck/test
evidence before opening a PR.

## Resolution

Confirmed the inference in Investigation: this is resource contention, not a
logic bug. One file already carried the evidence —
`src/api/routes/host-fs.test.ts` had independently opted itself into a 30s
timeout with a comment explaining why: "buildServer pulls in the core's whole
module graph; the first one costs a few seconds and more under full-suite
load. That is boot cost, not a hang." The other nine affected files were
hitting the same class of slowdown (real child-process spawns and real
filesystem I/O — graph client pool, viz-manager, git-status, host-fs — getting
starved of CPU/disk when `turbo run test` runs all five workspace suites
concurrently) but were still on vitest's un-overridden 5000ms default, so any
run unlucky enough to land those operations during peak five-way contention
timed out instead of just running slow.

Fixed by setting `testTimeout: 20_000` and `hookTimeout: 20_000` once, at the
package level, in `packages/core/vitest.config.ts` — matching the fix already
proven for `host-fs.test.ts`, rather than adding a per-file override to each
of the other nine files one at a time. `host-fs.test.ts`'s own 30s override is
still more generous than the new 20s default, so it was left as-is rather than
removed.

Verified: `pnpm --filter core typecheck` clean; three consecutive
`pnpm test --force --continue=always` runs from the repo root (the exact
reproduction command from this report) all green — 81/81 `@sparstrow/core`
test files, 692/692 non-skipped tests, no timeouts, across all five
workspaces each time.

## Recurrence — 2026-08-24

Hit again on `claude/nextjs-app-status-migration-fd2a49` during `T-VR-01`, on a
plain `pnpm test` from the repo root. Two of the ten files this report
originally named failed:

| File | Timed out at | Why the fix missed it |
|---|---|---|
| `src/projects/variants.test.ts` | **15000ms** | Sets its own per-test timeout at [`variants.test.ts:124`](../../packages/core/src/projects/variants.test.ts:124), which is *below* the package default. Raising the package default to 20s therefore never applied to it |
| `src/api/routes/host-fs.test.ts` | **30000ms** | Its own 30s override was exceeded outright — contention was worse than when the fix was verified |

**The gap in the original resolution.** It reasoned about files "still on
vitest's un-overridden 5000ms default" and raised the floor for them. That is
correct and still holds. What it did not check is whether any file sets a
timeout *lower* than the new default — a per-test `}, 15000)` argument wins
over `testTimeout`, so `variants.test.ts` was left on a budget the package fix
cannot raise. A package-level floor only floors files that have not opted out
in the other direction.

**Evidence it is still contention, not a hang or a regression.** Both files
pass in isolation on the same tree — `host-fs.test.ts` 10/10 (the failing test
itself taking 9.8s of its 30s), `variants.test.ts` 5/5 (2.5s). A second
`pnpm test` on the identical tree, with no code change, went fully green:
84/84 files, 718 passing. The failing run reported `collect 553.10s` against
`419.39s` on the green one, so the machine was materially more loaded.

**Not fixed here.** `T-VR-01` is a Vite retirement task and this is
pre-existing and orthogonal; bumping a timeout inside it would bury an
unrelated change in that diff. What the fix should be, when someone takes it:
audit `packages/core/src/**/*.test.ts` for per-test and per-suite timeout
arguments below `testTimeout`, and either remove them so the package floor
applies or raise them past it — the general form of this bug, rather than
patching `variants.test.ts` alone and waiting for the next file to surface.

## Second fix — 2026-08-24

**The audit this report asked for was run.** Exactly one file in the repo sets
a per-test or per-suite timeout *below* its package default:
`packages/core/src/projects/variants.test.ts:124`, at `15000` against a 20s
`testTimeout`. Removed, so the test inherits the package floor, with a comment
saying why a number must not be reintroduced there.
`src/api/routes/host-fs.test.ts`'s suite-level `30_000` is *above* the default
and was correctly left alone. No other file in `packages/core`,
`packages/shared` or `apps/web` carries one.

`pnpm test` green afterwards — 1,385 tests across 5 packages.

**What this does not fix.** The 2026-08-24 recurrence had two failures, and
this addresses one. `host-fs.test.ts` blew its own 30s budget on a run whose
slowest test takes 9.8s in isolation — a >3× slowdown under five-way
contention. Raising that number again is the whack-a-mole this report already
warned about, so it was deliberately not done.

The real cause is CPU oversubscription: `turbo run test` runs five workspace
suites concurrently and each spawns its own vitest worker pool, so the machine
is asked for several times the parallelism it has. The structural fix is
capping concurrency — `turbo --concurrency`, or `poolOptions` in
`packages/core/vitest.config.ts` — which trades solo-run speed for
full-run reliability. **That is a real trade and should be chosen
deliberately**, not slipped into a bug-fix pass, which is why this entry stays
open rather than being marked resolved.

## Recurrence 2026-08-27 (`T-DI-02`) — now hitting `apps/web` too

Three consecutive `pnpm test` runs at the repo root on the same unchanged tree,
during `T-DI-02` (a SQL-and-docs-only task — no TypeScript changed between the
runs):

| Run | Result |
|---|---|
| 1 | `Tasks: 5 successful, 5 total` — fully green |
| 2 | `Tasks: 3 successful, 5 total` — `web` reported `1 failed \| 441 passed` |
| 3 | `Tasks: 3 successful, 5 total` — `web` passed 442/442; a different task failed |

Every package passes in isolation, immediately after: `web` 40 files / 442
tests, `@sparstrow/core` 87 files / 748 passed + 4 skipped, `@sparstrow/shared`
316, `@sparstrow/desktop` 28.

**What this adds to the report:** the contention tail is no longer confined to
`@sparstrow/core`. `apps/web` — whose own flake
([`BUG-2026-08-20-flaky-realtime-live-events-test`](BUG-2026-08-20-flaky-realtime-live-events-test.md))
was fixed at the source and closed — now also fails intermittently under
five-way turbo contention while passing alone. That is consistent with this
report's stated cause (CPU oversubscription, not any one suite's budget) and is
further evidence against another timeout bump: two different packages failing
on alternating runs of an unchanged tree is a scheduling problem, not a slow
test.

The failing test's name was not captured — the failure did not reproduce on the
next run, and re-running to catch it produced a failure in a *different* task
instead. Recording that honestly rather than guessing which test it was.

**Practical effect on this band:** `T-DI-01` and `T-DI-02` were verified by
running each package's suite separately, and their Results say so. A green
per-package run is the stronger evidence here anyway; a red full-run that goes
green in isolation says nothing about the code under test.
