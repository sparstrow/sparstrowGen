# T-CS4-01 — composer reads the cache, triggers refresh

| | |
|---|---|
| **Tag** | `[S]` — sole implementation task in this phase |
| **Serves** | `US3` — "the model list always matches what the provider actually offers" |
| **Depends on** | CS3 (needs `provider_model_cache` and `request_model_discovery` to exist) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

## Checklist

- [ ] A read path for `provider_model_cache` scoped to the current workspace
      and `provider = 'antigravity'` (a small server action returning the
      row, or a direct client-side Supabase read under RLS — match whatever
      this page's existing data-fetch pattern already is, per
      `apps/web/CLAUDE.md`'s note that this page is pre-Server-Component)
- [ ] Opening the provider picker (or switching to `antigravity`) triggers
      the read; if the row is missing or `checkedAt` is older than 1 hour,
      also calls `request_model_discovery('antigravity')` (CS3)
- [ ] `claude-code`'s branch of the same dropdown is untouched — still reads
      `KNOWN_MODELS["claude-code"]` directly, no fetch, no loading state
- [ ] Populated: dropdown options come from the cache row's `models`
- [ ] Empty: no cache row yet → "no models available yet" message, refresh
      already triggered
- [ ] Loading: a subtle "checking for updates" indicator while a triggered
      refresh is in flight, without hiding the last-known list underneath
- [ ] Error/stale: a failed or absent live refresh (`live: false` on the
      cached row) shows a "may not be current" note alongside the last-known
      list — never a blank picker
- [ ] `apps/web` typecheck and tests green

## Traps

- **A picker that blocks on the dispatch's latency is a UX regression, not
  an improvement** — the cached list (even if stale) must render
  immediately; the refresh happens alongside it, never instead of it.
- **Don't let a failed refresh silently keep showing a `live: true` badge**
  from a stale row — check `detail`/`live` on what's actually cached, not
  just whether a row exists at all.

## Verification

- [ ] With a fresh `provider_model_cache` row seeded (or dispatched live,
      if CS3's live path was provable): open the picker, confirm it matches
      the cached list exactly
- [ ] Seed a stale row (`checkedAt` > 1 hour ago); open the picker; confirm
      a refresh is triggered and the UI shows the stale-but-usable state
      first
- [ ] Delete the cache row entirely; open the picker; confirm the empty
      state, not a blank dropdown
- [ ] Full acceptance-scenario walk in [T-CS4-02](T-CS4-02-verification.md)

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
