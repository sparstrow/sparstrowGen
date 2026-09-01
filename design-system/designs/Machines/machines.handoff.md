# Machines — handoff

| | |
|---|---|
| **Prototype** | `machines.dc.html` |
| **Provenance** | List view: [`doc/specs/2026-08-16-setup-and-machines.md`](../../../../doc/specs/2026-08-16-setup-and-machines.md) US1 (now updated for browser-loopback pairing, not the code-based flow that spec was written against). Machine profile (tab strip + side sub-nav): **exploratory — no spec** — extends `DESIGN.md` §9's resolved *shape* and `design-system/DECISIONS.md` DD-003/DD-008, which explicitly say "still needs `product-requirements` before build." Provider logos: closes the open item at `DESIGN.md` §13. |
| **Mode** | build (list) + explore (profile, provider logos) — see Provenance |
| **Status** | draft |
| **Design system** | mirror, at `design-system/` — built 2026-08-19 (as `design-system-v2`), promoted to the sole `design-system/` 2026-08-31 when the earlier system it was compared against was deleted; this prototype moved with it |

## What this is

Rebuilds the stale (2026-08-17, pre-doctrine) Machines prototype from scratch:
a machines **list** with the entity-tile pattern and provider-logo icon stacks,
plus a brand-new per-machine **profile** — the outer tab strip + inner side
sub-nav pattern `DESIGN.md` §9 specifies and DD-008 says should ship to
Machines first. Clicking a row opens its profile as a closable tab
(Overview / Providers / Activity / Settings), matching DD-003's exact ask:
"showing which AI agents that machine holds — Claude, Antigravity, Ollama —
each with an icon or logo."

## Provider logos — the sourcing decision

`DESIGN.md` §13 flagged this as unresolved ("the doctrine requires them (§2.1)
and none exist in the repo. Sourcing and licensing is unresolved") and the
request that produced this prototype specifically asked to source them from
multica. **They are not sourced from multica.** `references/multica` (local,
gitignored, read-only reference clone) vendors 24 provider logos in
`packages/views/runtimes/components/provider-logo.tsx`, and per-logo
attribution comments in that file show most are either unlicensed brand
trademarks (Cursor, Kiro, CodeArts, Antigravity, Trae, MiniMax, Hermes, Pi,
Reasonix, Qoder) or improvised extractions from installed app bundles (DevEco,
Dim) — not safe to redistribute. Only 2 of the 24 carry a stated permissive
license (QwenPaw/Apache-2.0, DeepSeek Harness/MIT), and even those should come
from their own upstream repo, not a copy inside multica. Multica's own root
LICENSE separately restricts hosted/embedded reuse of its source generally.

Instead, every mark here is copied verbatim from
[simple-icons](https://github.com/simple-icons/simple-icons)
(`icons/<slug>.svg`), **CC0 1.0 Universal** per that repo's own `LICENSE.md`
— verified directly against the file, not assumed. Existence of each slug was
confirmed against the repo's live file tree (not guessed), one call, not
per-icon. 8 slugs matched our real + anticipated provider set:

| Capability string | simple-icons slug | Real today? |
|---|---|---|
| `claude-code` | `claudecode` | yes |
| `anthropic-api` | `anthropic` | yes |
| `ollama` | `ollama` | yes |
| `antigravity` | **none exists** — no safe mark to source | yes |
| `qwen` | `qwen` | anticipated (PATH-discovery) |
| `deepseek` | `deepseek` | anticipated |
| `gemini` | `googlegemini` | anticipated |
| `mistral` | `mistralai` | anticipated |

`antigravity` has no safe source (too new for simple-icons; multica's own copy
is an unlicensed PNG pulled from an installed app bundle) — `providerBadge()`
in `machines.dc.html` falls back to a plain neutral circle-glyph for it and for
any capability string with no entry in `PROVIDER_ICONS`, matching multica's own
honest precedent for its "ZeroClaw" placeholder rather than inventing a fake
official mark.

**Colour: rendered monochrome (`currentColor` at `--muted-foreground`)
everywhere**, not each brand's real colour. simple-icons ships single-path,
single-colour SVGs with no colour data attached — assigning each one a
bespoke, *contrast-verified* brand tint is real doctrine work (the same rigor
`DESIGN.md` §2.3's brand-preset sweep applied, caught twice by DD-004/DD-010)
that this prototype does not attempt. See "Open questions" below.

## Component mapping

| Prototype element | Use | Notes |
|---|---|---|
| Entity tile + status dot | existing pattern, `DESIGN.md` §6 | Hand-rolled here (`.tile`/`.stdot`); real build uses the same pattern already in `machines.tsx`'s `MachineTile` |
| Status pill/word | existing pattern | active=success, draining=warning, inactive=muted — matches `machineState()` in `packages/shared` |
| Provider logo badge | **NEW** — `ProviderLogo` doesn't exist as a real component yet | `providerBadge()`/`PROVIDER_ICONS` in this prototype is the reference implementation; promote to a real `packages/ui` component (generic, capability string → icon) per DD-015's "would this make sense in a different product" test — it would |
| Rename input | existing `Input`, inline-edit pattern already in `machines.tsx`'s `RuntimeRow` | Copied behavior verbatim: commit/cancel called directly from Enter/Escape, not via blur-routing |
| Revoke/Remove confirm dialogs | existing `ConfirmDialog` | Copy verbatim from `machines.tsx`'s real `ConfirmDialog` usage |
| Tab strip (outer) | **NEW** — `DESIGN.md` §9.1, no real component yet | One tab per open machine, closable, reused on re-click (never duplicates) — verified live, see Verification |
| Side sub-nav (inner) | **NEW** — `DESIGN.md` §9, no real component yet | Overview/Providers/Activity/Settings |
| Settings toggle switches | existing `Switch` (`SnapshotControl`/`TerminalAccessControl` in real `machines.tsx`) | Moved from always-visible row footers into the Settings sub-nav section — see "Invented" |
| Empty/Loading/Error | existing `Empty`, `Skeleton`, inline error pattern | Copy for Empty/error matches `machines.tsx` verbatim; loading skeleton shape is this prototype's own |

## Token usage

Everything used exists in `design-system/tokens/colors.css`, which mirrors
`globals.css` correctly (this system was built specifically to fix the
original's stale mirror — see `README.md`'s comparison table). `--success` and
`--warning` hold the colour itself here, `-foreground` is the neutral for a
solid fill — the `DD-012` model, applied directly, no workaround needed.

**History, not a current issue:** this prototype was first built inside the
*original* `design-system/`, whose `colors.css` had never been re-synced after
`DD-012` (base token = pale tint there, `-foreground` = the real colour) and
was also missing `--brand`/`--identity-*`/`--approval`/`--danger` entirely.
That build used `--success-foreground`/`--warning-foreground` for every solid
mark to match what that stale mirror actually shipped. When the prototype
moved into this system (2026-08-31, replacing the original), those were
inverted back to the base tokens, and the file's four invented tokens
(`--space-4`, `--space-5`, `--font-mono`, `--transition-base` — none of which
this system defines, on purpose) were replaced with the literal values they'd
resolved to, matching the convention every guideline card here already uses
("Literal px for card chrome — the app defines no spacing tokens.").

## States

| State | Reachable in prototype | Notes |
|---|---|---|
| Populated | yes — default | 4 machines: 2 active, 1 unreachable, 1 draining. `workshop-desktop` carries the full anticipated provider set (8) to demonstrate icon-stack overflow (`+4`) and the Providers tab at full breadth — see "Invented" |
| Empty | yes — devbar toggle | Copy matches the real `machines.tsx` empty state verbatim, including the "sparstrow isn't published yet" honesty note |
| Loading | yes — devbar toggle | Skeleton shaped like the real row, not a spinner |
| Error | yes — devbar toggle, with working Retry (→ loading → populated after 700ms) | Copy matches `machines.tsx`'s real error copy |

The devbar list-state switcher and the "Simulate: machine just paired" /
"Reset" buttons are **prototype-only**, not real product UI.

## Data contract

Grounded in the real schema (`packages/shared/src/db/schema.ts`'s `runtimes`
table) via `design-system/lib/sparstrowgen-data.js`, which this prototype
updated:

| Field | Source | Exists? |
|---|---|---|
| `runtime.{id,name,os,hostname,isElectron,capabilities,status,coreVersion,lastHeartbeat}` | `runtimes` table | yes |
| `runtime.reportedSettings.{wipSnapshot,terminalAccess}` | `runtimes.reportedSettings` jsonb, per `SETTING_WIP_SNAPSHOT`/`SETTING_TERMINAL_ACCESS` in `packages/shared` | yes |
| Machine "just paired" detection | client-side id-diffing against a known-ids baseline, per `machines.tsx`'s real `knownIdsRef` effect | yes — real logic, simulated here via a button instead of a real websocket/poll arrival |
| Per-machine activity feed (Activity sub-nav) | — | **no backend today** — this section is a one-line placeholder, explicitly flagged in its own copy as future work |
| `GET /api/v1/runtimes` error shape | — | same invented 503 copy the previous prototype used; still no real precedent |

**No new backend work for the list or Settings/Overview sections** — every
field they show already exists and already has working mutations
(`renameRuntimeAction`, `revokeRuntimeTokenAction`, `removeRuntimeAction`,
`setRuntimeSettingAction`, all in `apps/web/src/app/machines/actions.ts`).
**The Providers and Activity sub-nav sections are presentation-only** over
existing/absent data respectively — Providers reads the existing
`capabilities` array, Activity has nothing behind it yet.

## Interactions

| Interaction | Real or faked |
|---|---|
| Devbar state switcher, Simulate-pair, Reset | **prototype-only tools**, not real UI |
| Row click → opens machine profile as a new tab; re-click on an already-open machine focuses its tab, never duplicates | real behavior, local state — verified live |
| Tab close (×) | real, local state |
| Side sub-nav switching, state preserved per tab while switching between tabs | real, local state — verified live (switching Machines↔profile tab and back kept the profile's last-viewed sub-nav section) |
| Inline rename (click name → edit → Enter/Escape) | real, local state only — no network call. **Enter must call `stopPropagation()`** — see "Found & fixed" below |
| Revoke / Remove (from both the list row and the profile's Settings tab) | real local-state mutation + `ConfirmDialog` copy; **no network call** |
| Settings toggles (Snapshot / Terminal access) | real local-state toggle; disabled with the real "unreachable" copy when the machine isn't active |
| Retry (error state) | faked — jumps to loading then populated after 700ms, doesn't hit a real endpoint |

## Invented

- **Settings moved out of the list row into the profile's Settings tab.** The
  real `machines.tsx` renders `SnapshotControl`/`TerminalAccessControl` as an
  always-visible footer on every list row. Once a profile page exists, keeping
  those full controls in the list too is redundant chrome the whole point of
  DD-003's split was meant to remove — this prototype declutters the list
  down to identity + status + providers + quick revoke/remove, and moves the
  two settings blocks into Settings. **Not approved anywhere** — a real,
  debatable UX call, not a doctrine requirement.
- **`workshop-desktop`'s 8-capability list.** Real capability sets today are
  2-3 items max (`claude-code`, `antigravity`, `ollama`, occasionally
  `anthropic-api`). Bumped to 8 (adding `qwen`, `deepseek`, `gemini`,
  `mistral`) specifically to demonstrate the icon-stack overflow affordance
  and give the Providers tab something to show at real breadth. **Not a claim
  about what any real machine reports today.**
- **Activity sub-nav copy** ("3 runs in the last 24h..."). No real activity
  feed exists for a machine; this is a placeholder shape, not sourced data.
- **Provider logo colour: monochrome only.** See "Provider logos" above —
  deliberate, pending real contrast-verified brand tints as separate work.
- **`antigravity`'s fallback glyph** (a plain neutral circle-with-dot). No
  official mark exists to source; this is a deliberate placeholder, not a
  claimed logo.
- **Tab strip / side sub-nav visual chrome** (height, icon sizing, active-tab
  underline colour). `DESIGN.md` §13 already lists "tab strip visual design"
  as deliberately undecided beyond the §9 contract (one tab per entity,
  closable, unique labels, ARIA roles) — pixel-level choices here are this
  prototype's own, not doctrine.
- **Sub-nav section set** (Overview / Providers / Activity / Settings).
  `entity-profile-board.html`'s reference board used Overview/Agents/
  Activity/Settings; renamed "Agents" → "Providers" here since "Agents" is
  Sparstrowgen's own name for a *different* first-class entity (the Agents
  nav destination) and reusing it for a machine's provider list would read as
  a navigation collision, not a section name.

## Open questions

- Per `DESIGN.md` §13 (deliberately undecided, unchanged by this prototype):
  should each provider logo eventually carry a real, contrast-verified brand
  tint, or stay monochrome permanently as part of the doctrine's restraint
  stance? This prototype renders monochrome and does not answer the question.
- Should `antigravity` get a real mark once Google publishes brand assets for
  it, or does Sparstrowgen design its own original glyph the way multica did
  for ZeroClaw? Not decided — the current fallback is a generic placeholder,
  not a considered answer either way.
- DD-003 says the machine profile "still needs `product-requirements` before
  build" — this prototype is explicitly exploratory (see Provenance) and does
  not substitute for that.

## Not included

- Cost/usage tracking, agent-to-runtime binding, custom pricing, or a
  workspace-visibility toggle — real functionality in multica's equivalent
  page, but none of these have a backing data model in Sparstrowgen today.
  Out of scope for a UI prototype; would need their own spec.
- Remote CLI self-update (multica's `machine-cli-section.tsx`) — Sparstrowgen
  has no update-push mechanism to a running daemon; not attempted.
- Cascade-delete UX for agents bound to a runtime (multica's
  `delete-runtime-dialog.tsx` two-mode confirm) — Sparstrowgen has no
  agent-to-runtime binding concept to cascade over.
- Real sidebar/router wiring — this is a page-content mockup inside a bounded
  app-frame, not a working route or a real app-shell integration.
- Any real network call — every mutation here is local state.

## Verification — 2026-08-31

**Tested:** `machines.dc.html`, served via `ds.mjs serve` at
`localhost:4321/designs/Machines/machines.dc.html`, against this handoff's
States/Interactions tables above and the real `machines.tsx`/`actions.ts`
source, at 1250×850 and 1600×900 viewports.

### Checklist
- [x] Populated state — 4 rows, correct entity tile + status dot colour per state (active=green, draining=amber, inactive=muted)
- [x] Empty state (devbar toggle) — copy matches real page verbatim
- [x] Loading state (devbar toggle) — skeleton shape, no header count shown
- [x] Error state (devbar toggle) — no header count shown
- [x] Retry (error → loading → populated, count and data restored)
- [x] Row click opens the machine's profile as a new tab
- [x] Re-clicking a row for an already-open machine focuses its existing tab rather than duplicating (§9.1)
- [x] Tab close (×) works, falls back to the list tab if the active tab is closed
- [x] Side sub-nav: Overview, Providers, Activity, Settings all render distinct, correct content
- [x] Providers tab: every capability renders its logo + label + id + "available" pill, including the `antigravity` fallback glyph
- [x] Settings tab: both toggles switch state and persist while navigating sub-nav tabs
- [x] Inline rename — commit via Enter
- [x] Inline rename — cancel via Escape
- [x] Revoke — confirm dialog copy, executes, dot/meta update, toast shown (tested from the list row)
- [x] Remove — confirm dialog copy, executes, row removed, tab (if open) closes, count decrements, toast shown (tested from the profile's Settings tab)
- [x] "Simulate: machine just paired" — appends a row, shows the dismissible just-paired panel
- [x] Dismiss just-paired panel
- [x] "Reset" restores the original 4-machine seed state
- [x] Console clean across every state and action above

### Found & fixed
- **Renaming via Enter also opened a profile tab for the row just renamed.**
  The rename `<input>`'s `keydown` handler called `commit()` (which
  re-renders the row, replacing the input with the button again) but never
  called `stopPropagation()`. The same native Enter keydown event then
  bubbled to the row's own keydown handler — wired for keyboard
  accessibility (`DESIGN.md` §9.3: "every list row ... a real focusable,
  keyboard-activatable control") to open the profile on Enter/Space. By the
  time it bubbled up, the input was already gone from the DOM, so the row
  handler's `e.target.closest("[data-rename]")` guard (meant to recognize
  "we're still inside the rename control") found nothing and treated the
  Enter as "open profile" too. Reproduced live, not theoretical: renaming
  `workshop-desktop` opened a `workshop-desktop` profile tab in the same
  action. Fixed by calling `stopPropagation()` in the input's Enter and
  Escape handlers.

### Found & not fixed
- None.

### Environment caveats
- **`read_page`/`find`-returned element refs computed screen coordinates that
  did not match the actual rendered position** in this session, consistently
  and reproducibly — clicking a ref for "Rename workshop-desktop" or the
  devbar's "Empty" button landed clicks tens to hundreds of pixels away from
  the real control, on unrelated elements. Direct `computer` clicks using
  coordinates read straight from a screenshot worked correctly every time.
  All interaction testing above was done via screenshot-coordinate clicking,
  not ref-based clicking, once this was discovered. Root cause not
  determined — plausibly a viewport-scaling mismatch between the
  accessibility-tree snapshot and the custom-resized (1250×850 / 1600×900)
  viewport in this tool. Worth knowing before trusting `find`/ref clicks in a
  custom-resized viewport in a future session.
- **The key label `"Return"` still does not produce a real `Enter` keydown**
  in this browser tool (confirmed again, same as the prior verification pass
  on the old prototype) — use the label `"Enter"` instead. Re-confirmed live
  here, not assumed from the old note.
- **The first click after certain state transitions did not visibly repaint
  in the very next screenshot** (Empty→Loading, Loading→Error each needed a
  second click/screenshot to show the new state, even though the underlying
  state had in fact changed — confirmed by the following screenshot showing
  the correct, fully-updated state with no further input). Not reproduced
  for every transition (row interactions inside the populated list painted
  on the first screenshot every time) — narrow enough to be a rendering/paint
  timing quirk of this specific tool combination, not a bug in the
  prototype's own state machine, which never lagged behind its own `render()`
  calls when inspected via the DOM.
- Mono-surface and light-mode verification: **done in the 2026-08-31 pass
  below**, once the prototype moved into the system that actually mirrors
  `DESIGN.md` §2's surface classes (`surface-paper`/`surface-slate`/
  `surface-soft`/`surface-mono` on `<html>`, orthogonal to `.dark`). The
  original system this prototype was first built against had no such classes
  to switch to, which is why an earlier pass here skipped this check — that
  gap no longer applies.

## Verification — 2026-08-31 (migration to the sole `design-system/`)

Re-verified after the token-model and invented-token fixes described in "Token
usage" above, served fresh via `ds.mjs serve --root design-system --port
4322`.

- [x] `ds.mjs check --root design-system` — no drift
- [x] Populated state loads clean, console empty
- [x] Status dot + "online"/"shutting down" text render in the actual
  saturated `--success`/`--warning` colour (this is the exact bug the token
  fix corrects — visually confirmed green/amber, not the flat neutral the
  `-foreground` mix-up would have produced)
- [x] Row click → profile tab → Providers sub-nav: all 8 provider rows render
  their icon (7 real simple-icons marks + `antigravity`'s neutral fallback),
  label, capability-string id, and an "available" pill in the correct green
- [x] **Paper surface, light mode** (`<html class="surface-paper">`, `.dark`
  removed): full profile + Providers tab re-checked — background, text,
  provider icons, and "available" pills all legible, no unstyled/invalid
  `var()` fallbacks visible
- [x] **Mono surface, dark mode** (`<html class="dark surface-mono">`):
  same re-check, renders correctly
- [x] Console clean across every state above

No new findings — the interaction logic (tab strip, sub-nav, rename,
revoke/remove, confirm dialogs) is unchanged from the pass already recorded
above; only the file's CSS moved. Not re-run here: the full interaction
checklist from the original pass (rename/Enter/Escape, revoke, remove,
simulate-pair, dismiss, reset) — nothing in this migration touched that
JavaScript, only token references and literal-value substitutions in
`<style>`.
