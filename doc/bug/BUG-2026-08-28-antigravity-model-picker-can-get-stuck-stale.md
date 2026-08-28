# BUG-2026-08-28-antigravity-model-picker-can-get-stuck-stale

**Status:** 🟡 investigating
**Reported by:** owner (reported seeing a "stuck state" on the model picker; agent found the mechanism while comparing this design against an external project's architecture) — screenshot pending
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

Suspected trigger, from `useAntigravityModels` (`chat.tsx:248-278`):

1. `antigravity` becomes the active provider somewhere in the composer
   (`relevant` goes true).
2. `useProviderModelCache` reads `provider_model_cache`; if missing or older
   than 1 hour, `requestModelDiscoveryAction` fires — but only once per
   component mount, gated by `triggeredRef` (a ref, not a timer).
3. If that single discovery attempt fails or times out, `antigravity.ts`'s
   `discoverModels()` (`packages/core/src/providers/antigravity.ts:108-153`)
   resolves with `{ models: this.listModels() /* static fallback */, live:
   false, detail: "<error>" }` rather than throwing.
4. `record_provider_models` (`024_provider_model_dispatch.sql:76-90`)
   unconditionally upserts that result, **including bumping `checked_at` to
   `now()` on a failed/fallback report, identically to a successful one.**
5. Because `checked_at` just advanced, the cache reads as "fresh" for another
   hour even though nothing actually improved — and because `triggeredRef`
   only allows one attempt per mount, no retry happens again until the
   composer component itself unmounts and remounts (e.g. a full page reload),
   regardless of how much wall-clock time passes.

Net effect: one bad discovery (CLI logged out, a slow `agy models` command,
antigravity down transiently) can pin the picker on the static fallback list
with a permanent "may not be current" note for the rest of that page's
session, not just for an hour.

## Investigation

Read, not yet run against a live repro:

- `apps/web/src/app/chat/chat.tsx:236-278` — `useAntigravityModels`, the
  `triggeredRef`-gated, once-per-mount dispatch.
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

Compared against `multica-ai/multica`'s equivalent (`server/internal/handler/
runtime_model_catalog.go`), which explicitly separates two windows —
`modelCatalogRevalidateAfter` (freshness, short) vs `modelCatalogServeWindow`
(how long an *unused* snapshot survives, day-scale) — and, more importantly,
only writes a snapshot into its cache when the result is `cacheableModelCatalog(models,
supported, fallback=false)`: a discovery that fell back to a stale/local
answer is deliberately **not** persisted as if it were fresh. This repo's
`record_provider_models` has no equivalent guard.

Confirmed via the owner's screenshot: the observed state is `!antigravity.hasCache`
specifically (the "no models available yet" branch), not the "stale but
present" branch (`AntigravityFreshnessNote`'s "may not be current", which only
renders once a list *does* exist). That means `cache.data` was still `null`/
`undefined` throughout — either `record_provider_models` was never called at
all for this workspace yet (no runtime online/capable when
`request_model_discovery` ran — see `023_provider_model_cache.sql`'s "no
online, capable runtime right now" no-op path), or the one dispatched attempt
is still genuinely in flight. Not yet distinguished which, and not yet
confirmed whether the `checked_at`-reset mechanism above is what perpetuates
it once a first (possibly fallback) row does land — that part of the
investigation stands as originally written, now narrowed to the pre-cache
case as the immediately confirmed one.

## Impact

Low-to-moderate: `antigravity` is currently the only provider on the live
discovery path (every other provider uses a static `KNOWN_MODELS` list with
no discovery at all, so they're unaffected). A user on `antigravity` who hits
one bad discovery attempt sees a "may not be current" static list for the
rest of that page session, with no way to force a re-check short of a full
reload. Workaround: reload the page, which remounts the composer and resets
`triggeredRef`.

## Resolution

Not yet fixed — filed pending the owner's screenshot to confirm this is the
actual stuck state observed, and pending a decision (see chat) on whether to
adopt Multica's specific hardening (don't advance the freshness clock on a
fallback/failed report; retry periodically rather than once-per-mount) as a
targeted fix.
