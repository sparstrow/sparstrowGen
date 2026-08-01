> **Reference — point-in-time report.** Design audit from PR #39. Not a live plan; findings
> from this date, not the current state.

# Design Audit — Sparstrowgen UI

- **Date:** 2026-07-10
- **Branch:** `design-review/ui-audit-20260710`
- **Target:** local Vite UI (`localhost`) → core on `127.0.0.1:48750` (authenticated, live data)
- **Classifier:** APP UI (workspace-driven, data-dense) → App UI rules applied
- **Pages reviewed:** Dashboard, Agents, Runs, Schedule, Settings (dark + light + mobile)

## Headline scores

- **Design Score: A-** (up from B+ pre-fix) — strong, calm, intentional app UI. Typographic identity, mobile layout, heading semantics, and destructive-action safety all addressed.
- **AI Slop Score: A-** — genuinely NOT slop. No purple gradients, no 3-column icon-circle grid, nothing centered-by-default, cards earn their place.

## First impression

The app communicates competence and calm. Dark surface hierarchy is clean, the attention-first dashboard puts "Human Attention Required" at the top (correct priority for the user), and semantic status colors (emerald healthy/succeeded, amber degraded/attention, red failed/off) are consistent everywhere. First three things the eye lands on: the "Human Attention Required" card, the "2 waiting" header chip, the live/offline dot. Those are the right three. Hierarchy is telling the truth.

## What's already good (keep it)

- Coherent semantic color system (17 colors: grayscale neutrals + amber/emerald/red), all via CSS variables.
- Real empty states with warmth: Runs ("No runs yet — output streams here live"), Schedule (dashed border + icon + CTA).
- Loading skeletons that match content shape; buttons use a real ellipsis ("Starting…", "Saving…").
- Specific status/error copy (Settings health: "1 stored agent/project path(s) not found on disk").
- Monospace where it belongs: run IDs, file paths, cron expressions, the cron input.
- Destructive delete styled with `text-destructive`.
- Dark AND light both render correctly.

## Findings — all fixed & verified

### F-001 — Numeric table columns not tabular / left-aligned — POLISH — FIXED ✅
Turns, Cost, Duration were left-aligned with proportional figures, so decimals and magnitudes didn't line up for scanning.
- **Fix:** `text-right tabular-nums` on those columns in Runs table + Dashboard recent-runs table.
- **Commit:** `e126b35` (`packages/ui/src/routes/pages/runs.tsx`, `dashboard.tsx`)
- **Verified:** computed style now `text-align:right`, `font-variant-numeric:tabular-nums`; decimals align; no console errors.

### F-002 — Mobile layout breaks completely — HIGH — FIXED ✅
At 375px the fixed 240px sidebar (`app-shell.tsx`, `aside w-60 shrink-0`) never collapsed. Content was crushed to ~135px, titles overlapped badges, "Answer & wake" was cut off, horizontal scroll appeared.
- **Fix:** below `md` the sidebar becomes an off-canvas drawer, opened by a header hamburger, with a dimming backdrop and auto-close on navigation. Desktop unchanged (`md:static`).
- **Commit:** `18530d5` (`packages/ui/src/components/layout/app-shell.tsx`)
- **Verified:** mobile screenshot shows full-width content, drawer opens/closes correctly, auto-closes on nav; desktop confirmed `position: static`, hamburger hidden.

### F-003 — No typographic identity — MEDIUM — FIXED ✅
Primary font was the bare `ui-sans-serif, system-ui, sans-serif…` Tailwind default. Violated the universal "no default font stacks" rule and AI-slop signal #11 ("I gave up on typography").
- **Fix:** self-hosted **Inter Variable** via `@fontsource-variable/inter`, set as `--font-sans` (offline-friendly for a local-first tool). Monospace stack left unchanged (legitimate for IDs/paths/cron).
- **Commit:** `d139ed6` (`packages/ui/src/main.tsx`, `packages/ui/src/styles/globals.css`)
- **Verified:** `document.fonts.status === "loaded"`, computed body font is `"Inter Variable", ui-sans-serif, system-ui, sans-serif`; no FOUT/console errors.

### F-004 — Flat heading semantics — MEDIUM — FIXED ✅
`CardTitle` (`card.tsx`) rendered as a `<div>`. The whole app exposed one `<h1>` ("Dashboard") and no `<h2>/<h3>`. Screen-reader users couldn't navigate by heading; failed WCAG 1.3.1 / 2.4.6.
- **Fix:** `CardTitle` now renders a real heading (default `<h2>`, `as` prop for deeper hierarchies). Tailwind preflight resets heading size/weight/margins to inherit, so this is visually identical to the old `<div>`.
- **Commit:** `641917d` (`packages/ui/src/components/ui/card.tsx`)
- **Verified:** document outline now h1 → h2 for every card section (System, Providers, Recent runs, …), pixel-identical screenshot.

### F-005 — Destructive actions have no confirmation — MEDIUM — FIXED ✅
Several destructive actions fired immediately on click with no confirm/undo: delete cron job (Schedule), delete pipeline (Pipelines), "delete all signals" bulk delete (Memory), delete directive (Project). The app already gated the bigger deletes (agent, team, memory note) — this was an inconsistency, not a missing pattern.
- **Fix:** extracted a reusable `ConfirmDialog` on the shared Dialog primitives; routed the four ungated actions through it. Left "remove team member" (reversible) and the in-context task delete (fired from an already-open detail view) as-is.
- **Commit:** `ea31dc4` (`packages/ui/src/components/ui/confirm-dialog.tsx` + `schedule.tsx`, `pipelines.tsx`, `memory.tsx`, `project-detail.tsx`)
- **Verified:** clicking delete opens the confirm dialog; Cancel dismisses without deleting (row count unchanged); Delete label shows a pending state.

### Watch item — light-mode secondary text contrast
`--muted-foreground` = `oklch(0.556 0 0)` on white ≈ 4.5:1, right at the AA floor. It's used for a lot of secondary text. Consider nudging darker (e.g. `0.52`) for margin. Not fixed — a nudge, not a defect.

## Fix summary

| # | Finding | Commit | Verification |
|---|---------|--------|--------------|
| F-001 | Numeric table columns → right-align + tabular-nums | `e126b35` | computed style + screenshot |
| F-005 | Confirm gate on 4 immediate-delete actions (new `ConfirmDialog`) | `ea31dc4` | opened dialog, Cancel kept both rows |
| F-003 | Adopt Inter (self-hosted) as `--font-sans` | `d139ed6` | `fonts.status: loaded`, body = Inter Variable |
| F-004 | `CardTitle` renders `<h2>` (a11y outline) | `641917d` | h1→h2 outline, visually identical |
| F-002 | Responsive sidebar drawer < md | `18530d5` | mobile drawer opens/closes; desktop static |

- Gate: `pnpm typecheck` green (6/6 packages), `pnpm test` green (386 passed, 4 skipped).
- Design score: **B+ → A-**.

## PR one-liner
> Design review of the Sparstrowgen UI (App UI, dark+light+mobile). 5 findings fixed and verified: numeric columns → tabular, confirm gate on immediate deletes, Inter typeface, semantic card headings (a11y), responsive sidebar drawer. typecheck + test green.
