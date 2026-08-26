# BUG-2026-08-26-system-settings-route-does-not-exist

**Status:** 🔴 open
**Reported by:** agent — converting `T-WA-08`'s `settings.tsx` writes to Server Actions
**Reported:** 2026-08-26

## Symptom

The Settings page's "Advanced" panel (Settings → Workspace → Factory Health &
Engine → Advanced) always shows "No settings stored yet." — even though
nothing about a workspace's settings has actually been checked. The
work-in-progress-snapshot toggle elsewhere on the same page is correctly
gated off (see Investigation) and never renders at all in the one app this
repo now ships (`D-24`).

## Reproduction

1. Open `/settings?tab=health` on the deployed web app.
2. Expected: either real key/value settings, or an explicit "this isn't
   available here" state. Actual: the empty state renders unconditionally,
   because the read behind it silently fails.

## Investigation

`useSettings()`/`useUpdateSettings()` (`apps/web/src/api/hooks.ts`) call
`GET`/`PUT /system/settings`. That path is registered **nowhere** in
`apps/web/src/lib/api/handlers/` — not as a real route, not even as one of
`stubs.ts`'s explicit 501s. Any request to it falls through to the router's
generic 404.

`WipSnapshotCard` (the other consumer, `settings.tsx`) already knows this:
its own doc comment says "the hosted app has no `/system/settings` route at
all" and gates the whole card behind `if (account) return null;` — a check
that is now **always true** in the single collapsed app (`D-24` retired the
separate local-desktop UI that `account === null` used to mean;
`WebAccountProvider` always supplies one). So `WipSnapshotCard` is now dead
code, and `AdvancedCard` — which has no such gate — is the only place this
bug is still reachable.

`useUpdateSettings()` has zero write call sites left with a working read
underneath it: `AdvancedCard`'s own "Save changes" button can never appear
in the first place, because it renders only when `Object.keys(draft).length
> 0`, and nothing can be typed into a field the empty-state message already
replaced.

## Impact

Low — the panel reads as "you have no advanced settings" rather than an
error, so nobody is blocked by it, but it is a quietly false statement about
workspace state, and the surrounding two features (per-machine snapshot
toggle, workspace-level advanced settings) have not worked since at least
the `D-24` collapse to one app, possibly earlier.

## Resolution

**Not fixed — out of scope for this task.** `T-WA-08`'s mandate is
converting *existing, reachable* writes to Server Actions (plan DD-6 already
excludes literal stubs; this is the same exclusion for a route that never
existed at all, not even as a stub). `useUpdateSettings()` is left in
`hooks.ts` deliberately, matching the stub-hook exclusion pattern, since
building `updateSettingsAction` against a route that was never real would
invent behaviour rather than move it.

Fixing this needs a product decision this task cannot make on its own: does
"Advanced" settings mean a real `/system/settings` cloud table, or should
`AdvancedCard` (and the now-fully-dead `WipSnapshotCard`) be deleted as a
`D-25`-style transitional leftover? Either answer is a real change, not a
verbatim move.

**Clears when:** `/system/settings` gets a real cloud-backed implementation
(and `useUpdateSettings()` converts to a Server Action then), or `settings.tsx`
drops `AdvancedCard`/`WipSnapshotCard` as dead surface and this bug is closed
as moot.
