# CS4 — Dynamic model picker

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-chat-session-and-conversation-ux.md`](../../plans/2026-08-27-chat-session-and-conversation-ux.md) (CS4) |
| **Kind** | **serves US3** — ends in something the owner can use |
| **Spec** | [`../../specs/2026-08-27-chat-session-and-conversation-ux.md`](../../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Depends on** | CS3 |
| **Blocks** | nothing |
| **Status** | done (2026-08-28) |
| **Open questions** | none |

## The story this serves

> **US3 — The model list always matches what the provider actually offers**
> (spec)
>
> The owner opens the model picker for a provider — Claude, Antigravity, or
> another configured provider — and sees the models that provider actually
> offers right now, not a list that was accurate when the app was built.

**Acceptance scenarios this phase must satisfy:**

1. **Given** `antigravity` currently offers a model not in the app's
   built-in list, **When** the owner opens the picker, **Then** the new
   model appears as a selectable option.
2. **Given** `antigravity` has retired a model, **When** the owner opens the
   picker, **Then** it no longer appears.
3. **Given** the live list can't be reached, **When** the owner opens the
   picker, **Then** they still see a usable list (last known), clearly
   marked as possibly not current.

**Independent test:** Open the `antigravity` picker after its real lineup
has changed since `KNOWN_MODELS` was last updated; confirm the picker
reflects reality, not the static constant.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Model picker (`antigravity`) | Current cached list, refreshing in the background if stale | No cache row exists yet for this workspace: explicit "no models available yet" rather than a blank dropdown, with the refresh already in flight | A visible "checking for updates" indicator while a refresh is pending — the picker still shows the last-known list underneath, not a blocking spinner | Cache exists but is stale and a refresh attempt just failed: last-known list shown with a "may not be current" note |
| Model picker (`claude-code`) | Unchanged — static `KNOWN_MODELS["claude-code"]` | n/a | n/a | n/a |

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS4-01 — composer reads the cache, triggers refresh](T-CS4-01-picker.md) | `[S]` | US3 | CS3 | done (2026-08-28) |
| [T-CS4-02 — verification](T-CS4-02-verification.md) | `[S]` | US3 | T-CS4-01 | done (2026-08-28) |

## Objective

Replace `antigravity`'s hardcoded model dropdown source with a read from
`provider_model_cache`, triggering `request_model_discovery` (CS3) when the
picker opens and the cache is missing or older than 1 hour (plan Decision 2).
`claude-code` is untouched.

## The shape of what was found

`apps/web/src/app/chat/chat.tsx`'s composer builds its provider/model
dropdowns directly from the shared `KNOWN_MODELS` constant (line ~557:
`KNOWN_MODELS[provider]?.[0] ?? "sonnet"`), with no fetch of any kind. This
is a client component (`"use client"`), one of the ~25 pages not yet on the
Server Component pattern per `apps/web/CLAUDE.md` — reading the cache here
is a client-side fetch (React Query, matching this page's existing data
pattern) rather than a Server Component data load, since the picker is
inside an already-client-rendered composer.

## Definition of done

- US3 acceptance scenarios 1–3, walked with a real `antigravity` lineup
  change (or a seeded cache row simulating one, if a live CLI isn't
  reachable at verification time — say so explicitly, per CS3's own
  verification gap if it applies).
- All four states on the picker.
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** any change to `claude-code`'s picker, or to how a
provider/model selection is stored on the session (unchanged —
`updateSessionField` already persists it).

---

## Decisions already made

Plan decision 2 (1-hour staleness) is inherited, not re-litigated here.

### 1. The picker fetches the cache on open, not on every render

A `useQuery`-style fetch (matching this page's existing data-fetching
pattern) keyed on `(workspaceId, "antigravity")`, run when the provider
dropdown is opened or switched to `antigravity` — not polled continuously.
If the returned row's `checkedAt` is older than 1 hour or absent, fire
`request_model_discovery` and let the next open (or a short-lived
re-fetch once the dispatch would plausibly have landed) pick up the fresh
row.

## Files

| Path | Change |
|---|---|
| `apps/web/src/app/chat/chat.tsx` | edit: `antigravity`'s model list source; loading/stale/error UI on the picker |
| `apps/web/src/app/chat/actions.ts` (or a new small data-fetch, matching this page's existing pattern) | new: read `provider_model_cache`, call `request_model_discovery` |

## Traps

- **Don't fetch on every keystroke or every render of the composer** — the
  picker opening (or provider switching to `antigravity`) is the trigger,
  not a `useEffect` with too broad a dependency array.
- **`claude-code`'s branch of this same dropdown code must stay on the
  static path** — a refactor that accidentally routes both providers
  through the new fetch would add a dispatch nobody asked for and a
  loading state where the spec explicitly says none is needed.

## Verification

Full procedure in [T-CS4-02 — verification](T-CS4-02-verification.md).
