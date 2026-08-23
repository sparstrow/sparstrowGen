# T-01 — Theme Infrastructure

| | |
|---|---|
| **Tag** | `[S] sequential` — blocks UI implementation |
| **Serves** | **foundational** — Theme Sync Architecture |
| **Depends on** | none |
| **Blocks** | T-03 |
| **Phase spec** | [SettingsRedesign](../../plans/2026-08-22-SettingsRedesign.md) |
| **Status** | not started |

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

- [ ] Tick T-01 in `../MasterTaskQueue.md`
- [ ] Update this file's **Status** row
