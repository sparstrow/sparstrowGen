# BUG-2026-08-20-flaky-realtime-live-events-test

**Status:** 🔴 open
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

## Notes

Seen once earlier the same day and **not** written up at the time, because the
failing test's name had scrolled away and a report that can name neither the test
nor a reproduction is not a report. It recurred during the final sweep, which is
when the name, the timing and the turbo-only reproduction were captured. Recorded
in `T-M8-05`'s Result either way.
