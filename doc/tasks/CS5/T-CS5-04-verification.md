# T-CS5-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of CS5 in place |
| **Depends on** | T-CS5-01, T-CS5-02, T-CS5-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the foundational phase for real — **needs an online, paired runtime**
to exercise the daemon-side download and spawn. If unreachable in this
environment, name that plainly and record what's unproved in `KnownGaps.md`
rather than treating the unit-tested pieces as equivalent proof.

## A — The technical assertions (foundational phase)

- [ ] An uploaded attachment's bytes reach the runtime's local disk before
      the turn's CLI spawn starts, for both a `project` and a `free` session
- [ ] The CLI's reply demonstrably reflects the attached file's actual
      content (not just acknowledges a filename) — this is US4's real bar,
      not "a file exists somewhere"
- [ ] A `free`/`agent` turn's scoped `Read` grant does not survive into the
      next turn in the same session
- [ ] A download failure (expired/invalid signed URL, network cut) fails the
      turn legibly within `TURN_TIMEOUT_MS`, not silently or by hanging
- [ ] This unblocks CS6 — say so explicitly

## B — What must NOT have changed

- [ ] A chat turn with NO attachment behaves exactly as before this phase —
      no new file writes, no new tool grants, no latency regression
- [ ] `project` sessions' existing `Read`/`Grep`/`Glob` access is unchanged
      for turns without an attachment

## C — What can be verified today

- [ ] Everything in A/B, given an online paired runtime and a real CLI
      provider

## D — What needs something that doesn't exist yet

**Needs an online, paired runtime with a working CLI provider** to prove the
daemon-side download and the CLI actually reading the file. If unreachable:
record exactly which assertions above were only unit-tested, not live-proven.

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `packages/core` and `packages/shared` build

## On completion

- [ ] Tick CS5's rows in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update the phase `README.md` status line and task table
- [ ] Update the plan's own **Status** row (CS5 done unblocks CS6)
- [ ] Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

<!-- Filled in when the task lands. -->
