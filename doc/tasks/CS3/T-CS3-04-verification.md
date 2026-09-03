# T-CS3-04 — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of CS3 in place |
| **Depends on** | T-CS3-01, T-CS3-02, T-CS3-03 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

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

- [x] `discoverModels()` on `antigravity` returns a real list when `agy` is
      reachable, and falls back to `listModels()` with `live: false` when it
      isn't — proved live by T-CS3-01 against the real installed `agy`
      v1.1.22 (14 real models, `live: true`), and by its unit tests for the
      fallback paths (nonzero exit, spawn throwing)
- [x] `request_model_discovery('antigravity')` dispatches to an online,
      capable runtime and results in a `provider_model_cache` row within a
      few seconds — proved live by T-CS3-03's full end-to-end pass (real
      paired scratch daemon, real command claimed and completed within
      seconds)
- [x] The cache row's `models` reflect what `agy models` actually returned,
      not the static `KNOWN_MODELS.antigravity` list — confirmed by T-CS3-01:
      genuine drift found (Gemini 3.7/3.6 Flash, all three effort tiers each,
      missing from the static list), and T-CS3-03's live pass populated the
      cache with that same real 14-model list, not the static one
- [x] With no online runtime, the request returns cleanly and any existing
      cache row is left untouched — `request_model_discovery` returns void
      without inserting a command row when `pick_runtime_for` finds nothing
      (see its SQL body, T-CS3-03's Decisions section); no write path touches
      `provider_model_cache` outside `record_provider_models`, so an
      untouched row is structural, not something that needs its own live
      re-test
- [x] This unblocks CS4 — the plumbing CS4's picker needs (live-populated
      `provider_model_cache`, a callable `requestModelDiscoveryAction`) is
      in place and merged on the band branch

## B — What must NOT have changed

- [x] `claude-code`'s model list and behavior are completely unchanged — it
      implements no new method (`CliProvider.discoverModels` is optional;
      `claude-code.ts` was not touched by any CS3 task)
- [x] Every existing `runtime_commands` kind (`run.start`, `run.cancel`,
      `chat.turn`, `project.clone`, `memory.sync`) still dispatches and acks
      correctly — confirmed by this task's own fresh `pnpm --filter
      @sparstrow/core test` run (757 passed, 4 skipped, 0 failed) against the
      merged state of all three CS3 tasks; `dispatch()`'s switch gained one
      case, the existing cases are byte-identical (`commands.ts` diff across
      the three merged PRs touches only the new case and its imports)
- [x] The local `POST /providers/discover-models` route
      (`packages/core/src/api/routes/providers.ts`) — a different consumer
      of a different provider set — still works unchanged: untouched by any
      CS3 file list, and its own tests are part of the same green
      `@sparstrow/core` run above

## C — What can be verified today

- [x] Everything in A/B, given an online paired runtime — all verified, per
      above, by combining T-CS3-01/02/03's own live evidence with this
      task's fresh regression pass. No new live daemon pairing was re-run for
      this task: T-CS3-03's own end-to-end pass already exercised the full
      loop (T-CS3-01's `discoverModels()` → T-CS3-02's cache table →
      T-CS3-03's dispatch/RPC/route) together against real infrastructure,
      and re-running it here would reprove the same wiring without touching
      anything that changed since.

## D — What needs something that doesn't exist yet

**Needs a real `agy` binary reachable from the verifying machine to prove
the live (not just the fallback) path.** This was available and used.

- [x] Live `agy models` output compared against `KNOWN_MODELS.antigravity` —
      done in T-CS3-01, not deferred: confirmed real drift (3.7/3.6 Flash
      missing from the static list). Nothing in D remains unreached.

## E — Regression surface

- [x] `pnpm -r typecheck` and `pnpm -r test` green — run fresh for this task
      against the merged state of T-CS3-01/02/03 on `band/26-chat-session-and-conversation-ux`:
      `@sparstrow/shared` (316 tests), `@sparstrow/core` (757 passed, 4
      skipped), `web` (451 tests) all green; `tsc --noEmit` clean for all
      three packages
- [x] `packages/core` and `packages/shared` build (implied by the typecheck
      passes above — no separate build step exists for either beyond `tsc`)

## Additional check this task added: idempotency-key collision (flagged unverified by T-CS3-03)

Not independently re-tested live, closed instead by static inspection:
`runtime_commands.idempotency_key` carries a real `UNIQUE` index
(`uq_runtime_commands_idem`, confirmed in `packages/shared/drizzle/0000_special_romulus.sql:608`).
`request_model_discovery`'s insert (`024_provider_model_dispatch.sql`)
deliberately has **no** `on conflict` clause — a genuine collision would
surface as a unique-violation error to the caller, not fail silently. The
key embeds `pg_catalog.now()::text` (transaction timestamp, effectively
unique per top-level call — this function is invoked once per browser
action per click, never batched inside one transaction), so two calls
producing the same key is not a realistic occurrence, matching the intent
recorded in T-CS3-03's Decisions ("repeated discovery requests are expected
and each should dispatch fresh"). No `KnownGaps.md` entry needed for this —
the mechanism is provably safe by construction, not merely untested.

## Security

Fresh `get_advisors` (security) sweep run against the current live project
state (2026-08-28, post-merge of T-CS3-01/02/03): `record_provider_models`
does **not** appear among functions the `authenticated` role can execute —
confirms the `revoke ... from public` fix holds live, not just at the moment
it was applied. `request_model_discovery` does appear (WARN,
`authenticated_security_definer_function_executable`) — expected and
correct, the same accepted shape as this codebase's existing
`enqueue_chat_turn`/`start_run`/`cancel_run`/`bootstrap_workspace`/
`delete_own_account`, all deliberately callable by signed-in users with
membership enforced inside the function body. The two other findings
(`daemon_identities` RLS-enabled-no-policy, leaked-password-protection
disabled) predate this band and are out of scope for CS3.

## On completion

- [x] Tick CS3's rows in `MasterTaskQueue.md` — **deliberately not done**.
      `AGENTS.md` §2.9: the queue flips once, in the commit that lands the
      *band* branch on `development`, not per phase mid-band. CS1's and
      CS2's rows are still `queued` in the live queue for the same reason —
      consistent with established practice this session, not an oversight.
- [x] Update the phase `README.md` status line and task table
- [x] Update the plan's own **Status** row (CS3 done unblocks CS4)
- [x] Every unreached assertion above written into `KnownGaps.md` — none
      remain unreached; the one flagged-unverified item (idempotency
      collision) was closed by static proof above, not deferred

## Result

**2026-08-28 — done, consolidation rather than a second live pass.** CS3's
three constituent tasks each already did genuine, unmocked live
verification of their own slice — T-CS3-01 against the real `agy` binary,
T-CS3-02 against the real Supabase project's `pg_policies`, and T-CS3-03
with a full real paired-daemon, real-workspace, end-to-end pass that
already exercised all three tasks' code together. Re-running a fourth live
daemon pairing here would reprove wiring that hasn't changed since T-CS3-03
merged, so this task's actual value-add was: (1) a fresh regression run of
all three affected packages against the merged band-branch state, catching
any interaction the three sequential PRs might have introduced (found
none — 757/757 core tests, 316/316 shared, 451/451 web, all green); (2) a
fresh live security-advisor sweep confirming the `revoke ... from public`
fix T-CS3-03 applied is still in effect and that no new advisory surfaced;
and (3) closing the one item T-CS3-03 explicitly left open (idempotency-key
collision risk) by static proof rather than leaving it as a live gap.

No `KnownGaps.md` entry opened — every assertion in A–E was either directly
proved by a constituent task's own live verification or closed here.
CS3 is done; CS4 (the model picker UI, reading `provider_model_cache` and
calling `requestModelDiscoveryAction`) is unblocked and next.
