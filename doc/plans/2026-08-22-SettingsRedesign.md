# Settings Page Redesign & Theme Architecture — 2026-08-22

| | |
|---|---|
| **Spec** | n/a (internal) — derived directly from interactive prototype and design decisions |
| **Status** | Draft |
| **Trigger** | The owner found the nested tabs navigation bad and requested a unified single page redesign with working appearance controls |
| **Depends on** | None |
| **Touches** | `apps/web/src/app/settings/*`, `packages/ui/src/routes/pages/settings.tsx`, `packages/ui/src/components/`, Next.js middleware / layout for Cookie SSR |
| **Tasks** | doc/tasks/SettingsRedesign/ once decomposed |
| **Open questions** | none |

## Summary

The Settings page currently suffers from nested `<Tabs>` layout ("tabception"), confusing navigation between Account/Workspace/Profile, and a missing theme picker UI (parked in D-17). This plan replaces the layout with a 3-column unified sidebar design, drops all nested tabs, and formally implements the `DESIGN.md` §2 theming contract (Brand Accents + Surface Character + System Mode) wired securely to the Cloud DB via a Next.js cookie cache to prevent FOUC.

## What the spec asks for that isn't obvious

The theme picker requires *instant application* upon clicking (Option A from OQ-2), meaning the React component must manipulate the DOM's `data-surface` and `data-brand` attributes reactively *before* a database save is confirmed, while simultaneously syncing to Supabase and a Next.js cookie for subsequent page loads.

## Work breakdown

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| **Theme Sync Architecture** | Supabase DB schema updates (if needed) or profile JSONB modifications for theme preferences, plus the Next.js Cookie SSR reader. Invisible backend wiring. |

### Per story

| Story | Work | Delivers |
|---|---|---|
| **Unified Navigation** | Refactor `<SettingsPage>` to use a master-detail sidebar layout instead of tabs. | The owner can navigate between Profile, Appearance, Workspace, and Providers cleanly on one page. |
| **Appearance & Theme** | Build the Theme Picker UI components (Surface, Brand Swatches, Light/Dark/System expression) inside the Settings UI. | The owner can theme the application and see changes instantly without page reload. |

## Decisions

### DD-014: Theme Architecture (Cloud DB + Cookie Cache)
We chose to store the theme in the user's Supabase account profile rather than strictly local storage. Because a DB fetch on every page load would cause a flash of unstyled content (FOUC), we chose to use a Next.js Cookie Cache. The Next.js server will read the cookie on the first byte to inject the `dark data-surface-slate data-brand-teal` classes, completely eliminating FOUC.

### Sidebar vs Continuous Scroll
We chose the "Master-Detail Sidebar" layout (Option 1 in the prototype exploration) over a continuous scroll or horizontal tabs. The sidebar gives a dedicated space for categories (Account vs Workspace) without the cognitive overload of nested tabs.

## Phases

### M1-Foundational — Theme Infrastructure (foundational)
Implement the Supabase profile preference fields for `theme_surface`, `theme_brand`, and `theme_mode`. Set up the Next.js middleware / layout to read the cookie and inject the HTML classes.

### M2-Navigation — Unified Settings Page (serves US1)
Tear down the nested tabs in `packages/ui/src/routes/pages/settings.tsx`. Build the left sidebar navigation and the right-side detail pane.

### M3-Appearance — The Theme Picker (serves US2)
Implement the UI components for the Theme Picker. Wire the interactive CSS DOM manipulation (instant preview) and the save-to-DB logic.

## Scope boundaries

- **Density:** We are deliberately NOT adding a "Compact/Regular" density toggle. The app ships with a highly-tuned monitoring density (13px body, tight padding). (Recorded in DD-014).
- **Other Settings:** We are porting the *existing* settings (Profile, Workspace, Providers) into the new layout, not building new features for them yet.

## Verification

| Spec criterion | How it gets checked |
|---|---|
| Navigation | Clicking sidebar items instantly swaps the right pane content without nested tabs. |
| Theme Preview | Clicking "Teal" instantly changes the UI primary colors without clicking "Save". |
| FOUC Prevention | Refreshing the page on a Dark/Teal theme does NOT flash white or default amber before loading. |
| System Mode | OS preference switches automatically update the UI when set to System. |
