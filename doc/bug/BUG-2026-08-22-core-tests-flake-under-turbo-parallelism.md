# BUG-2026-08-22-core-tests-flake-under-turbo-parallelism

**Status:** 🔴 open
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

Not started.
