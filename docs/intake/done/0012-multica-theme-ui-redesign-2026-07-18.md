---
id: 0012
category: design
secondary_modes: [feature-change]
status: done
project: factory
surface: packages/ui (app shell + all pages)
date: 2026-07-18
screenshots: []
links: { branch: "claude/listener-ui-sparstrowgen-multica-14389f", commit: "30a8b99" }
resolution: shipped
---

# Multica-theme UI redesign (Sparstrowgen → Multica)

## What I brought (verbatim)

UI Redesign Specification (Sparstrowgen -> Multica Theme)

Context for Fable-5

This is a handoff specification. Your objective is to aggressively upgrade the existing Sparstrowgen UI to visually and structurally mirror the Multica open-source agent platform.

Codebase Context:

* Target Path: `D:\Sparstrow\Sparstrowgen\packages\ui`
* Architecture: Vite + React 18 Single Page Application (SPA).
* Routing: TanStack Router (`src/router.tsx`).
* Styling: Tailwind CSS (v4) with a custom Shadcn UI implementation (`src/components/ui`).
* Constraints: Do NOT migrate the app to Next.js. Maintain the Vite/TanStack architecture but upgrade the layouts and components. Keep existing internal terminology (use "Teams" instead of "Squads", "Pipelines" instead of "Autopilots").

### Phase 1: Global App Shell Overhaul

Target File: `src/components/layout/app-shell.tsx`

The current AppShell already implements a left-sidebar and top-nav. You must upgrade it to match Multica's advanced dashboard patterns:

1. Left Sidebar (`<aside>`):
   * Add a Workspace Switcher Dropdown at the top (profile, invites, logout).
   * Categorize the navigation links into strict groupings with section headers: Personal, Workspace, and Configure.
   * Install `@dnd-kit/core` and implement a Pinned Items section that allows users to drag-and-drop links (like specific projects or runs) into the sidebar for quick access.
2. Top Navigation (`<header>`):
   * Implement dynamic Breadcrumbs utilizing TanStack Router context (e.g., `Projects / My Next.js App`), replacing the current static prefix-based title logic.
   * Maintain the action counter and WebSocket status indicators, but style them as compact badges.
3. Global Overlays:
   * Implement a global CMD+K Search Command Palette (using `cmdk` or similar Shadcn primitive) to allow jumping between agents, teams, and projects.

### Phase 2: Page-by-Page Redesign

Execute the following layout changes across the `src/routes/pages/` directory.

Group A: Personal & Communication

* Chat (`chat.tsx`):
   * Install `react-resizable-panels`.
   * Implement a split-pane layout. The left rail contains the `ChatThreadList`. The right rail contains the active conversation.
   * Sync the active chat session to the URL search params (`?session=id`).
* Inbox/Messages (`messages.tsx`):
   * Redesign into a structured feed separating unread system notifications from direct agent mentions.
* Tasks & Runs (`tasks.tsx`, `runs.tsx`):
   * Wire up `@dnd-kit/sortable` to upgrade the Task Board into a true drag-and-drop Kanban interface (implement `BoardColumn` and `BoardCard`).
   * Apply dense data-grid styling to the Runs table.

Group B: Workspace & Operations

* Projects (`projects.tsx`):
   * Redesign the list into a high-density data grid (filtering, sorting).
   * On detail views (`project-detail.tsx`), introduce `ActorAvatar` components and use Shadcn `<DropdownMenu>` for standardized row actions. Ensure the detail page scrolls within the main AppShell container without overflowing.
* Teams (`teams.tsx`):
   * Redesign to showcase a visual hierarchy: a "Team Leader" agent at the top, delegating to underlying worker agents.
* Agents (`agents.tsx`):
   * For the Agent Creator flow (`/agents/create`), implement a side-by-side layout: an onboarding chat interface on the left, and a live Markdown (`SKILL.md`) preview pane on the right.
* Pipelines & Schedule (`pipelines.tsx`, `schedule.tsx`):
   * Redesign to clearly visualize cron triggers, webhooks, and automation health status.

Group C: Configuration & Infrastructure

* Settings (`settings.tsx`):
   * Refactor the current flat form into a nested Shadcn `<Tabs>` component.
   * Group settings strictly into Account (Profile, Preferences) and Workspace (General, Members).
* Knowledge & Terminals (`knowledge.tsx`, `terminals.tsx`):
   * Apply standard containment wrappers to ensure consistent padding and max-widths against the new App Shell.

### Phase 3: Verification & Handoff

1. Layout Integrity: Resize the window to verify the Sidebar collapses into a mobile drawer with a backdrop overlay.
2. Routing: Verify that nested routes correctly populate the new Top-Nav breadcrumbs.
3. Interactivity: Verify that `react-resizable-panels` and `@dnd-kit` behaviors (in Chat and Tasks) function without throwing React state errors.

## What the Listener understood

A handoff specification for an aggressive redesign of the entire Sparstrowgen UI (`packages/ui`) to visually and structurally mirror the Multica open-source agent platform. One coherent effort in three phases: (1) global app-shell overhaul — workspace switcher dropdown, nav grouped under Personal/Workspace/Configure headers, drag-and-drop Pinned Items (`@dnd-kit/core`), dynamic TanStack-Router breadcrumbs replacing static titles, compact status badges, and a global CMD+K command palette (`cmdk`); (2) page-by-page redesigns — split-pane chat with URL-synced sessions (`react-resizable-panels`), structured inbox feed, true drag-and-drop Kanban tasks (`@dnd-kit/sortable`), dense data grids for runs and projects, `ActorAvatar` + dropdown row actions on project detail, team-leader hierarchy on teams, side-by-side agent-creator (chat + live SKILL.md preview), automation-health visuals for pipelines/schedule, tabbed settings (Account vs Workspace), and containment wrappers for knowledge/terminals; (3) verification — mobile drawer collapse, breadcrumb correctness, and dnd/resizable interactivity without React state errors.

Hard constraints: stay on Vite + React 18 + TanStack Router (no Next.js migration), keep Sparstrowgen terminology ("Teams" not "Squads", "Pipelines" not "Autopilots"). New dependencies: `@dnd-kit/core`, `@dnd-kit/sortable`, `react-resizable-panels`, `cmdk`.

Captured as one item (the many parts serve a single redesign); primary mode `design`, secondary `feature-change` since it reworks existing surfaces. Owner confirmed this framing.
