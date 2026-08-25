# T-03 — Appearance Picker

| | |
|---|---|
| **Tag** | `[S] sequential` — requires T-01 and T-02 |
| **Serves** | `US2` — Appearance & Theme |
| **Depends on** | T-01, T-02 |
| **Blocks** | none |
| **Phase spec** | [SettingsRedesign](../../plans/2026-08-22-SettingsRedesign.md) |
| **Status** | done 2026-08-22 |

## Objective

Build the interactive Theme Picker component in the new Settings layout. Implement the CSS overrides to support `data-brand` and `data-surface`. Wire the UI so that clicking a theme swatch instantly updates the DOM and triggers the background sync built in T-01.

## Checklist

- [ ] Port the prototype's CSS for `.theme-option`, `.brand-swatch`, and the `data-brand` preset variables into the `@sparstrow/ui` global theme stylesheet
- [ ] Build the `AppearanceSettingsPane` React component inside `packages/ui` using Shadcn primitives
- [ ] Wire the React `onClick` handlers to instantly inject `data-surface` and `data-brand` onto `document.documentElement`
- [ ] Wire the React `onClick` handlers to call the API/Server Action from T-01 to save the preference
- [ ] Add `window.matchMedia` listener inside the component to handle System mode changes dynamically

## Traps

- **React Hydration Mismatches**: Be extremely careful that React does not try to hardcode `className="dark"` on the `<html>` tag during SSR if it doesn't match the cookie, otherwise Next.js will throw hydration errors. Use `next-themes` style suppression or careful attribute passing.

## Verification

- [ ] Open Settings -> Appearance. Click "Teal". Verify the UI changes to Teal instantly.
- [ ] Refresh the page. Verify the Teal theme loads instantly with zero flash of unstyled content.

## On completion

- [ ] Tick T-03 in `../MasterTaskQueue.md`
- [ ] Update this file's **Status** row

## Result

**Status reconciled 2026-08-25.** This row read `not started` until then, while [`../MasterTaskQueue.md`](../MasterTaskQueue.md) had said done since the band landed. The feature did ship — `feat(settings): Settings Redesign (Master-Detail Sidebar & Appearance Themes)` (#112), 2026-08-22 — so `done` is the honest status.

**No checklist item in this file was ever ticked**, and none has been ticked now: the boxes above record no evidence, and ticking them retroactively would assert a verification nobody can point to. The queue row is the only assertion that this task's checks were run. Recorded as [`G-38`](../../KnownGaps.md).
