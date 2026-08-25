# T-02 — Unified Navigation

| | |
|---|---|
| **Tag** | `[P] parallel` — can be done alongside T-01 |
| **Serves** | `US1` — Unified Navigation |
| **Depends on** | none |
| **Blocks** | T-03 |
| **Phase spec** | [SettingsRedesign](../../plans/2026-08-22-SettingsRedesign.md) |
| **Status** | done 2026-08-22 |

## Objective

Refactor the `SettingsPage` component (`packages/ui/src/routes/pages/settings.tsx`) to remove the nested tabs. Implement a clean Master-Detail layout with a left sidebar navigation for all settings categories (Profile, Workspace, AI Providers, Appearance).

## Checklist

- [ ] Strip out existing `<Tabs>` wrapping logic from `SettingsPage`
- [ ] Implement Sidebar component with sticky positioning and Lucide icons
- [ ] Implement right-hand detail pane that reacts to sidebar selection
- [ ] Ensure route URL optionally updates with a `?tab=category` parameter for deep linking
- [ ] All four states (empty, loading, error, populated) handled correctly for the settings data fetch
- [ ] `packages/ui` typecheck and tests green

## Traps

- **Breaking existing forms**: The settings page currently renders actual forms (Profile form, Workspace form). Do not delete their logic, just move them into the new layout structure.

## Verification

- [ ] Click through every sidebar item and ensure the correct pane renders instantly without double-tabs.
- [ ] Navigate to `/settings?tab=workspace` and ensure the Workspace pane opens by default.

## On completion

- [ ] Tick T-02 in `../MasterTaskQueue.md`
- [ ] Update this file's **Status** row

## Result

**Status reconciled 2026-08-25.** This row read `not started` until then, while [`../MasterTaskQueue.md`](../MasterTaskQueue.md) had said done since the band landed. The feature did ship — `feat(settings): Settings Redesign (Master-Detail Sidebar & Appearance Themes)` (#112), 2026-08-22 — so `done` is the honest status.

**No checklist item in this file was ever ticked**, and none has been ticked now: the boxes above record no evidence, and ticking them retroactively would assert a verification nobody can point to. The queue row is the only assertion that this task's checks were run. Recorded as [`G-38`](../../KnownGaps.md).
