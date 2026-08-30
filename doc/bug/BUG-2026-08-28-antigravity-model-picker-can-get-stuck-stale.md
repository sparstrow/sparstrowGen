# BUG-2026-08-28-antigravity-model-picker-can-get-stuck-stale

**Status:** 🟢 resolved
**Reported by:** owner (reported seeing a "stuck state" on the model picker; agent found the mechanism while comparing this design against an external project's architecture)
**Reported:** 2026-08-28

## Symptom

The `antigravity` provider's model picker in the chat composer (`ModelPicker` /
`useAntigravityModels`, `apps/web/src/app/chat/chat.tsx`) can show a stale
model list marked "may not be current" indefinitely — not refreshing again
even though more than the intended 1-hour staleness window has passed and the
underlying CLI is (or becomes) healthy again.

## Reproduction

**Confirmed live** — owner shared a screenshot (2026-08-28, same day filed):
a `Free chat` session, provider `antigravity`, after a completed exchange
("Hi" → reply, then an image-generation request → reply). The turn's footer
shows `Retry | antigravity ▾ | no models available yet — checking…` — that
exact string is `ModelPicker`'s own antigravity empty-state branch
(`chat.tsx:335-341`: `if (provider === "antigravity" && !antigravity.hasCache)
return <span>...no models available yet — checking…</span>`), stuck
permanently rather than resolving once discovery lands or falling back to a
static list. Owner's own framing: "model picker is still checking while I
chat. It didn't let me choose the model, but I could still chat." — confirms
the two systems are independently gated exactly as suspected: `isTurnBusy` /
`sendPending` (composer send-ability) never depends on `antigravity.hasCache`
(model-picker readiness), so the picker can wedge forever without blocking
chat at all — consistent with the app being otherwise fully usable in the
screenshot.

Trigger, from the original `useAntigravityModels` (`chat.tsx:248-278`):

1. `antigravity` becomes the active provider somewhere in the composer
   (`relevant` goes true).
2. `useProviderModelCache` reads `provider_model_cache`; if missing or older
   than 1 hour, `requestModelDiscoveryAction` fires — but only once per
   component mount, gated by `triggeredRef` (a ref, not a timer).
3. If no online/capable runtime existed at that moment,
   `request_model_discovery` (`023_provider_model_cache.sql`) is a documented
   no-op — nothing is ever written to `provider_model_cache` for this
   workspace. `cache.data` stays `null` forever, and because `triggeredRef`
   already latched permanently true, nothing ever retries again for the rest
   of that mount, regardless of how much wall-clock time passes or whether a
   runtime later comes online.
4. Separately (not the case this screenshot caught, but the same design gap):
   if a runtime *is* online but the discovery attempt itself fails,
   `antigravity.ts`'s `discoverModels()` (`packages/core/src/providers/
   antigravity.ts:108-153`) resolves with `{ models: this.listModels() /*
   static fallback */, live: false, detail: "<error>" }` rather than
   throwing, and `record_provider_models` (`024_provider_model_dispatch.sql:
   76-90`) unconditionally bumps `checked_at` to `now()` on that fallback
   report exactly as it would on a real success — so a row that exists but is
   stale reads as "fresh" for another hour even though nothing improved.

Both (3) and (4) reduce to the same root design gap: the client treated
"time since last attempt" (`checked_at`'s age) as if it were "time since last
success", and had no retry mechanism beyond a permanent one-shot latch.

## Investigation

- `apps/web/src/app/chat/chat.tsx:236-278` (pre-fix) — `useAntigravityModels`,
  the `triggeredRef`-gated, once-per-mount dispatch.
- `packages/core/src/providers/antigravity.ts:108-153` — every failure path
  (`pty.spawn` throw, 20s timeout, non-zero exit) resolves with the static
  fallback list and `live: false`, never a rejection.
- `packages/core/src/cloud/provider-discovery.ts:36-51` — reports whatever
  `discoverModels()` returned unconditionally; no distinction between "a real
  discovery landed" and "we're reporting our own fallback".
- `packages/shared/drizzle/policies/024_provider_model_dispatch.sql:76-90` —
  `record_provider_models` always sets `checked_at = excluded.checked_at`
  (i.e. `now()`), with no floor keeping a fallback/failed report from
  resetting the staleness clock the same as a genuine success would.
- `packages/shared/drizzle/policies/023_provider_model_cache.sql`'s
  `request_model_discovery` — confirmed the "no online, capable runtime right
  now" path is a deliberate silent no-op, exactly the case the owner's
  screenshot hit.

Compared against `multica-ai/multica`'s equivalent
(`server/internal/handler/runtime_model_catalog.go`), which explicitly
separates two windows — `modelCatalogRevalidateAfter` (freshness, short) vs
`modelCatalogServeWindow` (how long an *unused* snapshot survives, day-scale)
— and, more importantly, only writes a snapshot into its cache when the
result is `cacheableModelCatalog(models, supported, fallback=false)`: a
discovery that fell back to a stale/local answer is deliberately **not**
persisted as if it were fresh. Multica's server also uses a Redis-backed
cache specifically so every API replica shares one warm catalog; this repo
doesn't need that piece — Postgres (`provider_model_cache`) is already the
one shared store every Vercel function instance reads, so there's no
per-replica cache-coherency problem to solve with a second caching layer.
The portable, worth-adopting half of Multica's design was the freshness
semantics (a fallback/failed result must not fake a successful one), not
their storage layer.

## Impact

`antigravity` is currently the only provider on the live discovery path
(every other provider uses a static `KNOWN_MODELS` list with no discovery at
all, so they're unaffected). Before this fix: any user on `antigravity` whose
workspace had no online/capable runtime at the moment the composer first
checked would see "no models available yet — checking…" for the rest of that
page load, with no way to force a re-check short of a full reload — and even
once a runtime came online, nothing on the client side noticed. Chat sending
itself was never blocked by this (confirmed both by code and by the owner's
own report).

## Resolution

Fixed in `apps/web/src/app/chat/chat.tsx`'s `useAntigravityModels`
(`fix/antigravity-model-picker-stuck-checking`, cut from
`band/26-chat-session-and-conversation-ux`): replaced the permanent
`triggeredRef` latch with a self-rescheduling retry loop, and replaced the
age-only staleness check with `isTrustedProviderModelRow()`, which requires
`row.live === true` in addition to being within the 1-hour trust window — a
fallback/failed report (or no row at all) is never treated as fresh no matter
how recently `checked_at` was bumped. The loop dispatches
`requestModelDiscoveryAction`, waits `ANTIGRAVITY_DISCOVERY_WAIT_MS` (20s,
matching `antigravity.ts`'s own CLI timeout so a slow-but-real discovery has
time to land) before refetching, then — if still untrusted — waits
`ANTIGRAVITY_RETRY_GAP_MS` (10s) and repeats, reading cache state through a
ref each cycle so a repeated `null` result (referentially unchanged) doesn't
silently prevent the next attempt from firing. Cleans up its own timer on
unmount / `relevant` going false.

Repeated dispatch on a stale/missing cache is already the server's own
documented expectation — `023_provider_model_cache.sql`'s
`request_model_discovery` comment: "the picker may trigger one every time it
opens on a stale cache" — so no server-side change was needed; this was
purely a client-side gap.

**Verified live** (no code fix needed server-side to prove this): typecheck
and the full `apps/web` suite green (465/465), then a real browser session
(`agent-browser`, disposable `@sparstrow.test` magic-link account, port 3030)
against a workspace with no paired runtime — the exact condition the
screenshot showed. Confirmed via `performance.getEntriesByType('resource')`
timestamps that three discovery cycles fired at 26.0s, 56.4s, and 86.9s
(deltas of 30.3s and 30.5s, matching the coded 20s+10s cadence) instead of
stopping after one attempt, with the honest "no models available yet —
checking…" state staying visible throughout (correct, since no runtime was
ever actually available to answer) and zero console errors. Also confirmed
the retry loop stops cleanly on navigation away from `/chat` — no further
discovery requests fired in the 40s after leaving the page, so nothing leaks
in the background. A live success case (`hasCache` flipping true) was not
directly observed, since that requires a genuine paired antigravity runtime,
which this environment doesn't have — the fix's dispatch/refetch/read logic
is unchanged from the original working code path in that respect, only the
retry cadence and trust condition changed.

Housekeeping note (same as `T-CS6-01`'s): the disposable
`uipass-modelfix-*@sparstrow.test` account created for this verification was
not cleaned up — the runbook's cleanup SQL was blocked again by this
environment's own auto-mode action classifier. Left for a future sweep per
`doc/runbooks/agent-browser-session.md`.
