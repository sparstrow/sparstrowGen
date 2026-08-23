# T-02 — Unified Navigation

| | |
|---|---|
| **Tag** | `[P] parallel` — can be done alongside T-01 |
| **Serves** | `US1` — Unified Navigation |
| **Depends on** | none |
| **Blocks** | T-03 |
| **Phase spec** | [SettingsRedesign](../../plans/2026-08-22-SettingsRedesign.md) |
| **Status** | not started |

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
