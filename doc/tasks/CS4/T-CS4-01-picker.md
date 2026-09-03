# T-CS4-01 — composer reads the cache, triggers refresh

| | |
|---|---|
| **Tag** | `[S]` — sole implementation task in this phase |
| **Serves** | `US3` — "the model list always matches what the provider actually offers" |
| **Depends on** | CS3 (needs `provider_model_cache` and `request_model_discovery` to exist) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## The scenario this satisfies

1. `antigravity` offers a model not in the static list → it appears.
2. `antigravity` has retired a model → it stops appearing.
3. The live list can't be reached → last-known list shown, marked possibly
   stale.

## Objective

Swap `antigravity`'s model dropdown in the composer from `KNOWN_MODELS` to a
read of `provider_model_cache`, with the four states from the phase README.

## Decisions already made

Phase decision 1 (fetch-on-open, not polled).

**Correction found building this task, not in the plan:** "fetch-on-open" for
this page (client component, no discrete picker-open event to hook — see
phase README's "shape of what was found") means "fetch once the moment
`antigravity` is actually relevant," not "fetch unconditionally on mount."
The first implementation fetched `provider_model_cache` and dispatched
`request_model_discovery` on every single `/chat` page load regardless of
which provider was selected — caught live during this task's own browser
verification (`agent-browser`, per `doc/runbooks/agent-browser-session.md`),
not by inspection. Fixed with a latch (`antigravityTouched` in `ChatPage`,
OR'd with the active session/draft provider actually being `antigravity`)
that gates both the `useProviderModelCache` read and the discovery dispatch
— see `useAntigravityModels(relevant: boolean)` in `chat.tsx`.

**Second correction, same verification pass:** switching the provider
dropdown to `antigravity` calls `setDraftModel`/`updateSessionField`
synchronously with `modelsForProvider("antigravity", antigravity)[0]`, but
the cache fetch is async — at the instant of switching, `antigravity.models`
is still `[]`, so the model selection landed on `""` and stayed there even
after the real list arrived a moment later (an unlabeled, stuck-blank Model
select). Fixed with a self-healing `useEffect` inside `ModelPicker` itself:
once `antigravity.hasCache` goes true and the current `value` isn't among the
now-available `items`, it snaps to `items[0]`. Centralizing the fix in
`ModelPicker` covers all three call sites (active session, draft composer,
`RetryControls`) without duplicating the race-avoidance logic three times.

## Checklist

- [x] A read path for `provider_model_cache` scoped to the current workspace
      and `provider = 'antigravity'` — a new `GET /providers/model-cache`
      route (`apps/web/src/lib/api/handlers/providers.ts`) plus
      `useProviderModelCache` in `api/hooks.ts`, matching this page's
      existing React Query + `/api/v1` pattern (`apps/web/CLAUDE.md`'s
      pre-Server-Component note). Deliberately its own literal route, not
      folded into the `/providers/(.*)` stub in `handlers/stubs.ts` — that
      wildcard is genuinely host-local ("Provider management"); this read is
      real and cloud-side. Verified live that the literal route wins over
      the wildcard at the same router specificity (see `provider-routes.test.ts`).
- [x] Opening the provider picker (or switching to `antigravity`) triggers
      the read; if the row is missing or `checkedAt` is older than 1 hour,
      also calls `request_model_discovery('antigravity')` (CS3) — gated by
      the `antigravityTouched`/active-provider latch (see correction above),
      not unconditional
- [x] `claude-code`'s branch of the same dropdown is untouched — still reads
      `KNOWN_MODELS["claude-code"]` directly via `modelsForProvider`, no
      fetch, no loading state (confirmed live: zero `model-cache` requests
      fire while `claude-code` is selected)
- [x] Populated: dropdown options come from the cache row's `models`
- [x] Empty: no cache row yet → "no models available yet — checking…"
      message replaces the Select entirely, refresh already triggered
- [x] Loading: "checking for updates…" indicator alongside the last-known
      list while a triggered refresh is in flight
- [x] Error/stale: `live: false` on the cached row shows a "may not be
      current" note alongside the last-known list — never a blank picker
- [x] `apps/web` typecheck and tests green (455 tests, +4 from this task's
      own `provider-routes.test.ts`)

## Traps

- **A picker that blocks on the dispatch's latency is a UX regression, not
  an improvement** — the cached list (even if stale) must render
  immediately; the refresh happens alongside it, never instead of it.
  Confirmed live: the stale state keeps showing the last-known list while
  "checking for updates…" appears alongside it, not instead of it.
- **Don't let a failed refresh silently keep showing a `live: true` badge**
  from a stale row — check `detail`/`live` on what's actually cached, not
  just whether a row exists at all. `AntigravityFreshnessNote` reads
  `antigravity.stale` (`!cache.data.live`) directly, not row presence.
- **A refactor that routes both providers through the new fetch is exactly
  the bug this task's own live verification caught once** (the
  unconditional-fetch-on-mount correction above) — the `relevant` gate on
  `useAntigravityModels` is the fix, not a nice-to-have.

## Verification

**Live, unmocked, via `agent-browser`** (the Claude Browser pane's
`document.visibilityState` bug would have hidden the React Query fetches
entirely — `doc/runbooks/agent-browser-session.md`), against a disposable
`%@sparstrow.test` account and this task's own dev server
(`.claude/launch.json` `wt-cs4-01-web`, port 3030 per
`worktree-orchestration`'s port registry):

- [x] Fresh workspace, no cache row: switched to `antigravity`, confirmed
      the Empty state ("no models available yet — checking…") and the
      `POST /chat` Server Action (`requestModelDiscoveryAction`) firing —
      network-captured, not inferred
- [x] Seeded a fresh `live: true` row (3 models) directly in
      `provider_model_cache` for the disposable workspace (no live daemon
      paired for this pass — CS3's own dispatch is already proven end-to-end
      live in T-CS3-03; this task's job is the UI read, not re-proving
      dispatch): confirmed the Populated state showed exactly the 3 seeded
      models, in order, with no freshness note
- [x] Aged the same row to `checked_at` 2 hours ago and `live: false`:
      confirmed the Stale state — last-known list still shown, "may not be
      current" note present, `request_model_discovery` re-fired (captured in
      the network log), and after the refresh window the UI settled back to
      the same stale-but-usable state without an infinite spinner
- [x] Confirmed **zero** `GET /providers/model-cache` requests fire while
      `claude-code` is the active provider (this is what caught the first
      correction above) and confirmed the request DOES fire immediately
      once switched to `antigravity`
- [x] Confirmed the Model select self-heals from a momentary blank value to
      the real first model once the async cache fetch resolves (the second
      correction above)
- [x] `get_advisors` (security): unchanged from CS3's baseline — no new
      advisory from the new read-only GET route
- [x] Disposable workspace (and its seeded cache row, cascade-deleted) fully
      cleaned up afterward via the runbook's SQL, re-queried as empty

Full acceptance-scenario walk (all three US3 scenarios named end to end) is
[T-CS4-02](T-CS4-02-verification.md)'s job — this task's own pass above
already exercises the same three states directly, so T-CS4-02 is expected to
consolidate rather than repeat, per the T-CS1-03/T-CS2-02/T-CS3-04 pattern.

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [x] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, two real races caught and fixed by this task's own live
browser verification.** The plan's "fetch on open" for antigravity's model
list initially shipped as "fetch unconditionally on every `/chat` load,"
firing a `request_model_discovery` dispatch even when the composer was
sitting on `claude-code` — caught live via `agent-browser`'s network capture,
not by re-reading the code, and fixed with a relevance gate
(`antigravityTouched` latch OR'd with the active provider) threaded through
`useAntigravityModels(relevant)`. A second race — the Model select landing on
`""` and staying there after switching to `antigravity` before its cache
resolved — was caught the same way and fixed with a self-healing effect in
the shared `ModelPicker` component, covering all three dropdown call sites
(active session, draft composer, `RetryControls`) from one place.

All three US3 states (Populated, Empty, Stale) verified live against a real
Supabase project with a seeded `provider_model_cache` row (live dispatch
itself already proven end-to-end in T-CS3-03) — not unit-test mocks, since
this file has no existing component-test convention to extend (matching
CS1/CS2/CS3's own verification approach). The one new unit-test file this
task adds (`provider-routes.test.ts`) targets the API route layer instead,
where this codebase does have test coverage, and itself caught a real bug in
its own first draft (a malformed test URL made the `/providers/(.*)` stub
appear to shadow the new route) before being fixed to prove the opposite:
the literal route genuinely wins.
