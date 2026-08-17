# Machines — handoff

| | |
|---|---|
| **Prototype** | `machines.dc.html` |
| **Provenance** | [`doc/specs/2026-08-16-setup-and-machines.md`](../../../../doc/specs/2026-08-16-setup-and-machines.md) — US1 |
| **Mode** | build |
| **Status** | draft |
| **Design system** | mirror, at `design-system/` |

## What this is

A first-class **Machines** destination: pair a machine, see every machine
connected to the workspace with its status, rename/revoke/remove without
leaving the page. Promotes the existing `RuntimesCard`
(`packages/ui/src/components/runtimes-card.tsx`) out of Settings → Workspace →
General into its own page, per spec decision 4.

This prototype covers **US1 only** — acceptance scenarios 1–9. Scenarios 10–11
(the Settings card actually being gone, never needing to open Settings) aren't
demonstrable in a standalone mockup; they're implementation facts, not visual
ones. US2 (the setup guide) is a separate surface, not attempted here.

## Component mapping

| Prototype element | Use | Notes |
|---|---|---|
| Status dot + row | **existing** — the exact structure of `RuntimeRow` in `runtimes-card.tsx` | Reused near-verbatim, translated from JSX to vanilla JS |
| Capability / "shutting down" badges | existing `Badge` (`secondary`/`outline` variants) | Real component in `@sparstrow/ui`; not yet catalogued in `design-system/components/` — worth adding next |
| Revoke/remove confirm dialogs | existing `ConfirmDialog` (`packages/ui/src/components/ui/confirm-dialog.tsx`) | **Copy is verbatim from the real component** — not invented. Also not yet catalogued in the design system |
| Rename input | existing `Input` | Catalogued — see `components/forms/` |
| Pair button | existing `Button` `outline` variant | Catalogued — see `components/buttons/` |
| Empty-state panel | existing pattern (dashed border, centered icon+copy+CTA) | Matches `RuntimesCard`'s empty state structure |
| Loading skeleton | existing `Skeleton` | Not yet catalogued |
| **Error state** | **NEW — no real component to reference** | See "Invented," below. The real `RuntimesCard` has no top-level fetch-error UI today |
| Toast confirmation | existing `sonner` toast pattern | Visual only in this prototype — see Interactions |

Two real components used here (`ConfirmDialog`, and the badge/skeleton pairing
here) aren't in `design-system/components/` yet. Worth a follow-up `ds.mjs add`
pass — this prototype is what surfaced the gap.

## Token usage

Everything used is already in `design-system/tokens/`. Nothing new needed —
including `--warning` (for the "requires a dev checkout" honesty note) and
`--destructive` (error state, remove confirm), both already catalogued.

## States

| State | Reachable in prototype | Notes |
|---|---|---|
| Populated | yes — default | 4 machines: 2 active, 1 unreachable, 1 draining |
| Empty | yes — devbar toggle, or the natural path (remove all 4 machines) | Copy matches the real empty state verbatim |
| Loading | yes — devbar toggle | Skeleton shape, not a spinner, per `frontend-component-build` |
| Error | yes — devbar toggle | **Copy is invented** — no real precedent exists. See below |

The devbar state switcher at the top is **prototype-only**, not real product
UI — it exists so a reviewer can see all four states without wiring a real
failing request. Say so if this ever gets close to being mistaken for a design
decision.

## Data contract

Grounded in the real schema (`packages/shared/src/db/schema.ts`) rather than
invented — all three tables below already exist and are already used by the
real `RuntimesCard`:

| Field | Source | Exists? |
|---|---|---|
| `runtime.{id,name,os,hostname,capabilities,status,coreVersion,lastHeartbeat}` | `runtimes` table | yes |
| Active/unreachable (2-state UI) | derived: `status === "online" \|\| "busy"` → active | yes — this is exactly what `runtime.online` already does in the real card |
| `pairingCode.{code,expiresAt,consumedByRuntimeId}` | `pairing_codes` table | yes |
| Revoke | `daemon_tokens.revokedAt` | yes |
| Remove | delete the `runtimes` row (cascades) | yes |
| **`GET /api/v1/runtimes` error shape** | — | **no real precedent** — the prototype's 503 text is invented, see below |

**No new backend work for US1.** Everything the spec asks for already has a
table and, per `runtimes-card.tsx`, already has working mutations. This is
different from US2, where decision 5/6 add real new columns (workspace/profile
naming) — that's out of scope here.

## Interactions

| Interaction | Real or faked |
|---|---|
| State switcher (devbar) | **prototype-only tool**, not real UI |
| Pairing code countdown | real, ticking via `setInterval`, matches `PairingCodePanel`'s logic |
| Copy code button | calls the real `navigator.clipboard` API; shows a toast |
| Inline rename (click name → edit → Enter/Escape) | real, local state only — no network call |
| Revoke / Remove | real local-state mutation + the dialog; **no network call**, this is a mockup |
| Retry (error state) | faked — jumps to loading then populated after 700ms, doesn't hit a real endpoint |

## Invented

Everything here was decided by the prototype and approved by nobody:

- **Error-state copy** (`Couldn't load machines`, the `503` detail line). No
  real precedent exists anywhere in the codebase for this surface's fetch-error
  UI — this is a first draft, not a source of truth.
- **Exact pairing-instruction wording.** The prototype deliberately does *not*
  repeat the real (broken) `sparstrow pair <code>` instruction — spec decision
  3 requires honesty about needing a dev checkout — but the replacement text
  ("Clone this repo... run the core pairing command") is a **placeholder**. The
  actual correct command needs engineering confirmation before this ships;
  don't copy this string into production without checking it.
- **Nav placement.** Put "Machines" in the `Workspace` nav group
  (`app-shell.tsx`'s `NAV_GROUPS`), directly after `Agents` — reasoning: agents
  run on machines, so adjacency reads naturally. The spec only requires "one
  click from anywhere," not a specific position.
- **Capability values shown** (`claude-code`, `antigravity`, `ollama`) — real
  provider names from the code comment in `runtimes-card.tsx`, but this exact
  mix per machine is invented for the mockup.
- **Toast copy** ("workshop-desktop revoked — pair again to restore access.").
  Not sourced from anywhere real.

## Open questions

Carried from the spec's own Edge Cases section, rendered as a visible
assumption rather than silently resolved:

- *"Does a machine that paired but never started appear at all, or only after
  its first heartbeat?"* — This prototype assumes it appears immediately
  (matching the real `RuntimesCard`'s `justPaired` optimistic-detection
  effect), shown as the toast/list-append the moment pairing completes. Not a
  confirmed answer, just what the existing code already does.

## Not included

- US2 (the setup guide) and US3–US5 — separate surfaces, own specs' worth of
  work.
- Real sidebar/router wiring — this is a page-content mockup, not a working
  route.
- Any real network call — every mutation here is local state, for review
  speed. The real mutations (`useRenameRuntime`, `useRevokeRuntimeToken`,
  `useRemoveRuntime`, `useCreatePairingCode`) already exist in
  `packages/ui/src/api/hooks` and were not reinvented here.
