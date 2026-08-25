# T-SR-01 — Theme Infrastructure

| | |
|---|---|
| **Tag** | `[S] sequential` — blocks UI implementation |
| **Serves** | **foundational** — Theme Sync Architecture |
| **Depends on** | none |
| **Blocks** | T-SR-03 |
| **Phase spec** | [SettingsRedesign](../../plans/2026-08-22-SettingsRedesign.md) |
| **Status** | done except G-38 2026-08-22 |

## Objective

Set up the underlying data layer for the theming system so it travels with the user's account and loads without a flash of unstyled content. This involves extending the Supabase user profile schema to store `theme_surface`, `theme_brand`, and `theme_mode`, and building a Next.js cookie-reader to inject these as HTML attributes.

## Checklist

- [ ] Add `theme_surface`, `theme_brand`, `theme_mode` to Supabase `users` schema / Drizzle schema
- [ ] Create API route or Server Action to handle saving theme preferences to DB and updating the local `theme-prefs` cookie
- [ ] Update Next.js `RootLayout` (or middleware) to read `theme-prefs` cookie and inject `data-surface`, `data-brand`, and `class="dark/light"` into `<html>`
- [ ] `@sparstrow/shared` and `@sparstrow/ui` typecheck and tests green

## Traps

- **FOUC Race Condition**: If the layout uses a `useEffect` instead of Server-Side Rendering to inject the initial class, the screen will flash white on load. It MUST be read from a cookie and injected into the HTML stream on the server.

## Verification

- [ ] Log out and log in; verify the `theme-prefs` cookie is set.
- [ ] Manually change the cookie in dev tools, refresh the page, and verify the server renders the HTML with the matching classes instantly.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row

## Result

**Status reconciled 2026-08-25.** This row read `not started` until then, while [`../MasterTaskQueue.md`](../MasterTaskQueue.md) had said done since the band landed. The feature did ship — `feat(settings): Settings Redesign (Master-Detail Sidebar & Appearance Themes)` (#112), 2026-08-22 — so `done` is the honest status.

**No checklist item in this file was ever ticked**, and none has been ticked now: the boxes above record no evidence, and ticking them retroactively would assert a verification nobody can point to. The queue row is the only assertion that this task's checks were run. Recorded as [`G-38`](../../KnownGaps.md).
