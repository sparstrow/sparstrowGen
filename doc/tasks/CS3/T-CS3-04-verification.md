# T-CS3-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of CS3 in place |
| **Depends on** | T-CS3-01, T-CS3-02, T-CS3-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the foundational phase for real: an online `antigravity`-capable
runtime, asked to discover models, ends with a fresh, correct
`provider_model_cache` row. **This phase ships no UI** — nothing here is a
user-facing scenario walk; it's the technical assertions CS4 will build on.

**Needs a real `agy` install to fully prove the live path.** If none is
reachable in this environment, say so explicitly below rather than treating
the mocked-fallback unit tests as equivalent proof, and open a
`KnownGaps.md` entry naming exactly what's unproved.

## A — The technical assertions (replaces the acceptance-scenario section — foundational phase)

- [ ] `discoverModels()` on `antigravity` returns a real list when `agy` is
      reachable, and falls back to `listModels()` with `live: false` when it
      isn't
- [ ] `request_model_discovery('antigravity')` dispatches to an online,
      capable runtime and results in a `provider_model_cache` row within a
      few seconds
- [ ] The cache row's `models` reflect what `agy models` actually returned,
      not the static `KNOWN_MODELS.antigravity` list (unless they happen to
      still match — confirm by comparing, don't assume)
- [ ] With no online runtime, the request returns cleanly and any existing
      cache row is left untouched
- [ ] This unblocks CS4 — say so explicitly

## B — What must NOT have changed

- [ ] `claude-code`'s model list and behavior are completely unchanged (it
      implements no new method)
- [ ] Every existing `runtime_commands` kind (`run.start`, `run.cancel`,
      `chat.turn`, `project.clone`, `memory.sync`) still dispatches and acks
      correctly — the `dispatch()` switch gained a case, not a rewrite
- [ ] The local `POST /providers/discover-models` route
      (`packages/core/src/api/routes/providers.ts`) — a different consumer
      of a different provider set — still works unchanged

## C — What can be verified today

- [ ] Everything in A/B, given an online paired runtime

## D — What needs something that doesn't exist yet

**Needs a real `agy` binary reachable from the verifying machine to prove
the live (not just the fallback) path.**

- [ ] Live `agy models` output compared against `KNOWN_MODELS.antigravity`
      — if unreachable, record that here and in `KnownGaps.md`

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] `packages/core` and `packages/shared` build

## On completion

- [ ] Tick CS3's rows in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update the phase `README.md` status line and task table
- [ ] Update the plan's own **Status** row (CS3 done unblocks CS4)
- [ ] Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)

## Result

<!-- Filled in when the task lands. -->
