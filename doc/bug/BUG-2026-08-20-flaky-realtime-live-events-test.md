# BUG-2026-08-20-flaky-realtime-live-events-test

**Status:** 🟢 resolved
**Reported by:** agent — surfaced during
[`T-M8-05`](../tasks/M8/T-M8-05-verification.md)'s regression sweep, unrelated
to the change under test
**Reported:** 2026-08-20

## Symptom

`pnpm test` fails intermittently on one test, with a **timeout**, not an
assertion:

```
web:test:      × subscribes on run:<workspaceId>:<runId>, private 5547ms
web:test:  FAIL  src/lib/realtime-live-events.test.ts >
                 RealtimeLiveEventSource >
                 subscribes on run:<workspaceId>:<runId>, private
web:test:       Tests  1 failed | 214 passed (215)
```

5547ms against vitest's default 5000ms `testTimeout`. The test's own body does
almost nothing: it constructs a `RealtimeLiveEventSource` against a fully mocked
supabase client, awaits one macrotask, and makes three assertions.

## Reproduction

**It only fails through turbo, never on its own.**

- `pnpm test --force` — reproduced 2 times in 5 runs.
- `pnpm --filter web test` — 9 runs, 0 failures.
- `npx vitest run src/lib/realtime-live-events.test.ts` — 15 runs, 0 failures.

The difference is contention: `pnpm test` runs five packages' suites
concurrently, and `@sparstrow/core`'s 81 files include several that spawn real
`git` processes.

## Investigation

**This is the first test in the file, and it is the one that pays for the
module import.**

```ts
it("subscribes on run:<workspaceId>:<runId>, private", async () => {
  const { RealtimeLiveEventSource } = await import("./realtime-live-events");
  …
```

Every test in the suite does that dynamic `import()` — `beforeEach` calls
`vi.resetModules()`, so the module registry is cleared each time — but only the
**first** one pays for transforming the module and its import graph. Subsequent
tests hit vitest's transform cache and are fast.

So the cost being measured is *cold module transform*, and it is being charged
against a **test's** 5-second budget rather than a hook's. Under a five-way
parallel run on a loaded machine, that transform occasionally crosses 5s and the
test is killed mid-`await`. The timing supports this: 5547ms is the timeout
firing, not a slow assertion — a test that genuinely ran would report single-digit
milliseconds, as this one does on every passing run.

Nothing about `RealtimeLiveEventSource`, the fake channel, or the workspace-id
promise chain is racy. `flush()` is a `setTimeout(…, 0)`, which resolves on the
next macrotask regardless of load.

## Impact

**A CI failure that means nothing, on a test that is fine.** The specific harm is
that it teaches whoever sees it to re-run and move on, which is precisely the
habit that lets a real intermittent failure through later. It also makes
`pnpm test` an unreliable gate for the "verification before PR" rule in
`AGENTS.md` §2.3 — a rule the whole PR workflow leans on.

Not a product defect: `RealtimeLiveEventSource` itself is unaffected, and the
transport is exercised the same way in every passing run.

## Suggested fix

Not applied here — it surfaced inside an unrelated milestone's regression sweep,
and changing shared test configuration is not something to slip into a UI PR.

Two candidates, in order of preference:

1. **Move the import out of the test body.** Import once in a `beforeEach`
   *hook* (hooks get their own timeout) or drop the `vi.resetModules()` and hoist
   a single top-level `await import(…)` if the suite does not actually need a
   fresh registry per test — worth checking, since the module holds a cached
   workspace id, which may be exactly why the reset is there. This fixes the
   cause: the transform stops being charged to a test.
2. **Raise `testTimeout` in `apps/web/vitest.config.ts`.** One line, and honest
   as far as it goes — the default 5s was never chosen for this repo — but it
   moves the threshold rather than removing the dependency on machine load.

Either way the fix belongs with a repeat run of `pnpm test --force` (five or more
times) as its evidence, since a single green run proves nothing about a flake
that fires roughly two times in five.

## Resolution

Applied fix option 1 (preferred): moved the module import out of the test
body entirely.

**Root cause of the per-test `vi.resetModules()` + dynamic `import()`, once
checked against the module's own code:** it was not protecting anything.
`RealtimeLiveEventSource`'s `workspaceIdPromise` cache (the thing the original
investigation suspected) is **instance-level** (`this.workspaceIdPromise`),
not module-level — a fresh `new RealtimeLiveEventSource()` in every test
already starts with no cache, module registry reset or not. The mocked
`createClient()` factory (`vi.mock("@web/utils/supabase/client", ...)`) is
likewise stateless: it returns a new object literal on every call, and its
closures read the outer `fake` variable dynamically, which `resetFake()`
already reassigns in `beforeEach`. There was no module-singleton state for
`vi.resetModules()` to isolate between tests, so it was pure cost with no
isolation benefit.

**Change** (`apps/web/src/lib/realtime-live-events.test.ts`):
- Added a single top-level `import { RealtimeLiveEventSource } from "./realtime-live-events";` (vitest hoists `vi.mock` calls above it, so the mock is already in effect).
- Removed `vi.resetModules()` from `beforeEach` — only `resetFake()` remains, which is what actually provides per-test isolation.
- Removed all 14 per-test `const { RealtimeLiveEventSource } = await import("./realtime-live-events");` lines, now redundant with the top-level import.
- Added a comment on the `describe` block's `beforeEach` explaining why the reset was unnecessary, so a future reader doesn't reintroduce it "for safety."

This gets the one-time module-transform cost off any individual test's 5s
`testTimeout` clock — it's now paid once during collection instead, in the
`import` phase vitest reports separately from `tests`.

**Verification:**
- `pnpm --filter web typecheck` — clean.
- `pnpm --filter web exec vitest run src/lib/realtime-live-events.test.ts` — 14/14 passed, 3.94s total, `tests` phase only 112ms (the transform cost now lands in `import`, not charged to any test).
- Repeat-run evidence, matching the bug's own reproduction method (`pnpm test --force` at the repo root, i.e. full five-way turbo parallelism — the only condition that ever reproduced the timeout): **5 consecutive full-suite runs** (`pnpm test --force --continue=always`), all 5 with `apps/web`'s suite at **224/224 passed, 16/16 test files passed**, `realtime-live-events.test.ts` (14 tests) landing at 453ms, 622ms, 82ms, and 64ms across the runs — no timeout in any run. The original bug reproduced in roughly 2 of 5 such runs; this fix saw 0 of 5.
- `pnpm -r typecheck` and `pnpm -r test` — see Notes below for one caveat unrelated to this fix.

**Caveat found while gathering the above evidence, filed separately rather
than fixed here (out of this task's scope):** two of the five full-suite runs
also hit unrelated timeout failures in `@sparstrow/core`'s test suite (up to
25 tests across ten files — graph client/lifecycle/tools, viz-manager,
run-manager finalize, git-status, host-fs), independent of this fix and of
`apps/web`. Filed as
[`BUG-2026-08-22-core-tests-flake-under-turbo-parallelism`](BUG-2026-08-22-core-tests-flake-under-turbo-parallelism.md).

Landed on `fix/flaky-realtime-test`, based on `origin/development` at
`17a1e81` (post-#105, post-#106).

## Notes

Seen once earlier the same day and **not** written up at the time, because the
failing test's name had scrolled away and a report that can name neither the test
nor a reproduction is not a report. It recurred during the final sweep, which is
when the name, the timing and the turbo-only reproduction were captured. Recorded
in `T-M8-05`'s Result either way.
