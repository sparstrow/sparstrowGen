# Settings Redesign — Handoff

| | |
|---|---|
| **Prototype** | settings-redesign.dc.html |
| **Provenance** | User design feedback on Settings navigation |
| **Mode** | explore |
| **Status** | ready for review |
| **Design system** | mirror, at design-system/ |

## 1. Problem Statement
The previous Settings layout suffered from **nested tabception**:
- Row 1: [Account | Workspace]
- Row 2: [Profile | Preferences] (or [General | Integrations])
- **Friction**: Double-stacked tabs confused visual hierarchy, required two clicks to switch domains, and fragmented related settings into obscure sub-levels.

## 2. Explored Directions in Prototype

### Direction 1: Master-Detail Sidebar Layout (Recommended)
- **Structure**: Left-hand category rail with Personal and Workspace sections + Right-hand dedicated card pane.
- **Benefits**: Clean visual structure, instantly scalable as new settings are added, 1-click access to any category.
- **Reference**: Follows modern developer platforms (GitHub, Linear, Raycast, Vercel).

### Direction 2: Unified Single-Level Flat Tabs
- **Structure**: Replaces the 2-row nested pills with a single horizontal tab bar across the top:
  [ Profile ] [ Appearance ] [ Git ] [ Workspace ] [ AI Providers ] [ Health ] [ Danger ]
- **Benefits**: Flattens hierarchy while maintaining full-width layout.

### Direction 3: All-in-One Continuous Scroll with Sticky TOC
- **Structure**: All cards rendered on one scrollable page, with a sticky On this page sidebar jumping smoothly to each section.
- **Benefits**: Zero tab clicks; entire settings surface is visible and searchable in one place.

## 3. Interactive Features Built into Prototype
- **Live Paradigm Switcher**: Toggle between all 3 directions with one click in the top devbar.
- **Four States Covered**: Populated, Skeleton Loading, Error Banner.
- **Real-Time Settings Filter**: Instant search box filtering cards across all sections.
- **Theme Switcher**: Dark, Light, Paper Surface, and Pure Mono modes.
