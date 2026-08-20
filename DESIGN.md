# DESIGN.md — Sparstrowgen

> The design doctrine for this project. Every frontend agent reads this before
> designing or building anything. When this document and any other design
> guidance disagree, **this wins** — and no other file may restate its rules.
> Point at this document instead of copying from it.

| | |
|---|---|
| **Decided** | 2026-08-18, with the owner, via the `design-brief` skill |
| **Situation** | improve — keep the spine, fix what was thin |
| **Component library** | shadcn/ui, via `@sparstrow/ui` (26 primitives installed) |
| **References** | **Linear** (list & task surfaces) · **Vercel** (dark contrast, future FinOps) · **Supabase** (nested-menu motion) · **Multica** (system logic only — see §14) · **beautifului.dev** (AI-native component vocabulary; showcase, not installable) |
| **Status** | agreed with owner. Values in §2 are contrast-verified; §3 type scale is a new decision, not a mirror |
| **Supersedes** | the generic `DESIGN.md` + `DESIGN.json` retired 2026-08-17 — see `design-system/DECISIONS.md` DD-001 |

---

## 1. North star

Sparstrowgen is a **developer control plane for autonomous agents** — a place
you watch work happen and step in when it needs you. It is used for long
stretches, often while something is running, so it has to stay legible at hour
six and it must never make you hunt for state. The interface earns attention
rather than demanding it: colour, motion, and iconography all appear because
they carry meaning, and nowhere else.

The previous doctrine got the restraint right and the conclusion wrong: it
banned icons and colour outright rather than defining when they are earned. The
result was correct-by-the-rules and lifeless. **Restraint here means colour and
icons are always doing a job — not that they are absent.**

**Key characteristics**

- **Earned colour.** Three roles, fixed meanings, nothing decorative (§2).
- **Functional iconography.** Icons identify or indicate; never ornament (§6).
- **Warm-dark, themeable surfaces.** Dark-first, with the neutral ramp carrying
  a slight warm cast rather than being pure grey (§2.2).
- **Reading over chat.** Agent output is a document, not a message bubble (§8).

---

## 2. Colour

Sparstrowgen ships a **theming contract**, not a fixed palette. The user picks a
brand accent and a surface character; the doctrine guarantees every combination
is legible. All values are OKLCH — this is what makes the light/dark adaptation
work, because hue and chroma hold while lightness re-derives per mode.

> ⚠️ **Specification, not description — see `doc/KnownGaps.md` G-19.** This
> section is fully designed and contrast-verified, but it is proved only in
> `design-brief/theme-board.html`. The shipped `globals.css` still holds 72
> literal `oklch()` values with no derivation, so `--brand` and the surface
> variables **do not exist in the app yet**. Making §2 true is the first task of
> the design-system rebuild. Every other section of this document describes
> either what the code already does or what to do next time you write some;
> this one describes what to build.

### 2.1 The five colour roles — never mix them

| Role | What it means | Themeable? |
|---|---|---|
| **Brand** | Identity and interaction: links, active nav, primary actions, focus rings | **Yes** — user-selectable |
| **Status** | Semantic state: online, success, warning, approval, danger, info | **No — never** |
| **Provider** | External identity: Claude, Antigravity, Ollama marks | **No** — those are their brands |
| **Actor identity** | Telling one agent, machine, or column apart from another at a glance | **No** — see §2.5 |
| **Code syntax** | Highlighting inside code blocks: keyword, string, number, comment, type | **No** — see §2.6 |

**Status colour is not themeable, and this is the load-bearing rule of the whole
system.** If a user's accent choice could change what green means, the
customisation would eat the semantics — green must mean *online* in every theme,
or status stops being readable at a glance.

### 2.2 Surfaces — four characters, each with a light and dark expression

Surface sets the *character of the neutral ramp*. It is orthogonal to light/dark:
every surface has both expressions.

| Surface | Hue | Chroma | Character |
|---|---|---|---|
| **Paper** — *default* | 85 | 0.010 | Warm cast. Reads considered rather than default |
| Slate | 250 | 0.011 | Cool blue-grey. Crisper, more clinical |
| Soft | 280 | 0.007 | Lifted blacks, compressed contrast. Gentlest for long sessions |
| Mono | 0 | 0 | Pure neutral, chroma 0 — the stock baseline |

Ramp, where `h`/`c` come from the table above:

| Token | Dark | Light |
|---|---|---|
| `--background` | `oklch(0.145 c h)` | `oklch(0.985 c h)` |
| `--card` | `oklch(0.195 c h)` | `oklch(1 0 0)` |
| `--accent` / raised | `oklch(0.245 c h)` | `oklch(0.955 c h)` |
| `--foreground` | `oklch(0.97 0 0)` | `oklch(0.19 0 0)` |
| `--muted-foreground` | `oklch(0.68 c h)` | `oklch(0.48 c h)` |
| `--border` | `oklch(1 0 0 / 11%)` | `oklch(0.2 0 0 / 12%)` |

*Soft* is the one exception — it lifts the dark ramp to `0.19 / 0.228 / 0.268`
and softens `--border` to `8%`, which is the whole point of it.

### 2.3 Brand presets — lightness is calibrated per hue

**Dark mode uses `L = 0.78` for every hue. Light mode does not, and cannot.**
Relative luminance is dominated by the green channel, so a single light-mode
lightness fails: at a flat `0.56`, teal reached only 3.82:1. Each hue carries
its own calibrated light-mode lightness:

| Preset | Hue | Chroma | Dark L | Light L | Worst contrast |
|---|---|---|---|---|---|
| **Amber** — *default* | 70 | 0.15 | 0.78 | **0.528** | 4.51 |
| Violet | 285 | 0.18 | 0.78 | **0.538** | 4.51 |
| Blue | 250 | 0.16 | 0.78 | **0.520** | 4.52 |
| Teal | 190 | 0.12 | 0.78 | **0.496** | 4.50 |
| Rose | 15 | 0.16 | 0.78 | **0.542** | 4.51 |

Verified across 4 surfaces × 5 presets × 2 modes × **all three ramp steps** —
120 combinations, zero failures, worst case exactly 4.50 (Teal on Soft, light,
against `--accent`). Reproduce with `node design-brief/contrast-check.mjs`.

**Named rule — Measure Against the Whole Ramp.** A brand colour is measured
against `--background`, `--card` **and** `--accent`, in both modes. The first
published version of this table swept only the first two, and every one of the
five then failed against `--accent` in light mode — between 4.12 and 4.46. That
is not an obscure surface: `--accent` is the hover fill on every row, the active
tab, and the selected item, which is exactly where a brand-coloured label sits.
The light lightnesses above are 0.017–0.022 lower than the first version for
this reason.

**Measurement basis — state it, because the figures are otherwise
unreproducible.** Contrast is WCAG 2.x relative luminance, computed from OKLCH
via OKLab to **linear sRGB clamped to `[0,1]`**. The clamp is load-bearing:
several preset × surface pairs land marginally out of gamut, and skipping it
produces a luminance no display can show and figures that disagree with this
table. Leaving that unstated is what raised `doc/KnownGaps.md` G-21.

**Ships as: Amber on Paper, dark mode.** Amber's hue (70) sits 15° from Paper's
(85), so the accent reads as *within* the surface's warmth rather than against
it — cohesive by design. Separation comes from chroma (0.15 vs 0.010), not hue.

**Surface hue is not a tuning lever — measured, not assumed.** Because a surface
carries chroma 0.010, shifting its hue is imperceptible: moving Paper from 85 to
100 is a 0.13 JND change in OKLab, where 1 JND is the threshold of visibility.
Halving its chroma is 0.25 JND. Neither is visible. If the accent ever needs to
separate more, **move the brand hue, not the surface** — amber 70 → 50 is 2.6 JND
and plainly visible. Surface choice controls *warmth of character*; brand hue
controls *separation*. They are not interchangeable.

### 2.4 Status colours — fixed, in every theme

| Status | Dark | Light | Worst on any surface |
|---|---|---|---|
| Success / online | `oklch(0.78 0.16 155)` | `oklch(0.498 0.15 155)` | 4.52 |
| Warning / needs attention | `oklch(0.80 0.14 75)` | `oklch(0.42 0.12 70)` | 7.14 |
| **Approval** — *awaiting a human decision* | `oklch(0.78 0.15 310)` | `oklch(0.47 0.14 310)` | 6.04 |
| Danger / destructive | `oklch(0.70 0.19 22)` | `oklch(0.548 0.226 27)` | 4.50 |
| Info | `oklch(0.78 0.12 255)` | `oklch(0.42 0.13 255)` | 7.06 |

Each value is the **status colour itself** — the one used for a dot, an icon, a
label, a border, or a low-alpha tint behind one (`bg-warning/5`). A solid fill
takes a neutral on top, and which neutral flips with the mode because the dark
values are light and the light values are dark:

| | Text on a solid status fill | Worst |
|---|---|---|
| Dark mode | `oklch(0.16 0 0)` | 9.17 |
| Light mode | `oklch(0.985 0 0)` | 7.01 |

**Two of these were recalibrated on 2026-08-19, for the same reason the brand
presets were** — the original figures were never measured against `--accent`.
Success light went `0.52 → 0.498` (it was at 4.14) and danger light went
`oklch(0.58 0.25 27) → oklch(0.548 0.226 27)` (it was at 3.85). Both now clear
the floor on all twelve surface positions. `DD-010` is the general rule this
keeps running into: a floor is only as good as the sweep behind it. Derived by
`design-brief/status-identity-solve.mjs`, verified on every run of
`design-brief/contrast-check.mjs`.

**Approval is a fifth status, not a shade of warning.** *Needs attention* (a run
is blocked or failed) and *awaiting approval* (a run is fine and wants a human
to say yes) are triaged differently and must be separable across a room — that
is the whole job of a monitoring surface. Hue 310 keeps it clear of info (255)
and of the Violet brand preset (285), so it cannot be mistaken for either a
state it is not or a user's accent choice.

### 2.5 Actor identity — a palette, not a status

Six fixed hues, assigned by hashing a stable name, so one agent is one colour
everywhere it appears. Never a solid fill, and never large enough to read as a
state.

**Named rule — Identity Is Not Status.** No identity hue sits within **20°** of
a status hue. That leaves 155 of 360 hues legal, in six bands, and the six
below are the set with the largest possible minimum separation from each other
— **50° apart**, which is what makes two agents tellable apart at avatar size:

| | Hue | Dark | Light |
|---|---|---|---|
| `--identity-1` | 50 | `oklch(0.78 0.13 50)` | `oklch(0.48 0.13 50)` |
| `--identity-2` | 135 | `oklch(0.78 0.13 135)` | `oklch(0.48 0.13 135)` |
| `--identity-3` | 185 | `oklch(0.78 0.13 185)` | `oklch(0.48 0.13 185)` |
| `--identity-4` | 235 | `oklch(0.78 0.13 235)` | `oklch(0.48 0.13 235)` |
| `--identity-5` | 285 | `oklch(0.78 0.13 285)` | `oklch(0.48 0.13 285)` |
| `--identity-6` | 335 | `oklch(0.78 0.13 335)` | `oklch(0.48 0.13 335)` |

Worst case 7.16 in dark, 4.72 in light, across all twelve surface positions.

**The form is a neutral fill with an identity mark and ring, not an identity
tint.** This section used to say "a tint plus its own foreground", and that form
does not clear the contrast floor: an identity-coloured mark on a 15% tint of
its own hue tops out at **3.91** in dark mode, because the tint lifts the ground
by more than the mark gains. The tint is not the problem — colouring the mark
*and* the fill is. Two ways out, and only one keeps both signals:

| Form | Worst | What carries identity |
|---|---|---|
| Identity tint + identity mark | 3.91 ✗ | both, illegibly |
| Identity tint + neutral mark | 6.78 ✓ | the fill alone — and a 15% tint of one hue is hard to tell from another at 22px |
| **Neutral fill + identity mark + identity ring** | **7.16 / 4.72 ✓** | **both** |

So the avatar chip takes its fill from the surface's own raised step and spends
the identity colour on the mark and a ring at 40%. Same double encoding the
tint version was reaching for, legible in both modes.

**The palette shipping today violates the 20° rule** — it uses emerald, amber,
and rose, which are success, warning, and danger — so an avatar can currently
read as a state it has nothing to do with. Replacing it is part of the rebuild.

**Identity is not required to avoid the brand hues, and deliberately so.**
`--identity-5` at 285 is the Violet preset's hue exactly, and `--identity-3` at
185 is 5° from Teal. Adding a 20° brand exclusion was measured and rejected: it
collapses the legal space to four narrow bands and forces the six identities to
within **15°** of each other, trading the thing identity exists for against a
collision that only appears for one accent choice at a time.

**Identity is never themed.** It is excluded from the brand contract on purpose:
if a user's accent could recolour it, two agents could collapse to the same hue
and the palette would stop doing the one thing it exists for. A future theming
pass must not "unify" these with the accent.

**Named rule — Five Roles.** Every colour on screen is brand, status, provider
identity, actor identity, or code syntax. A colour that is none of those five is
a bug.

**Named rule — Contrast Floor.** Every brand preset clears **4.5:1** against
**every step of every surface ramp**, in both modes — see §2.3's measurement
basis. A new preset is not shippable until measured that way.

### 2.6 Code syntax — the fifth role, and the one nobody chose

Code blocks in chat and run transcripts are coloured by six tokens
(`--hl-comment`, `--hl-keyword`, `--hl-string`, `--hl-number`, `--hl-title`,
`--hl-attr`), one set per mode. They are none of the other four roles, which by
the letter of Five Roles would make them twelve bugs. They are not. Syntax
highlighting is a well-defined semantic mapping in its own right, and this
section exists so the rule describes the app instead of quietly excusing it.

**Named rule — Syntax Is Not Themed.** The syntax palette is fixed, like status
and provider identity. A user's surface or accent choice does not reach it.

Two reasons, and the second is the one that decides it. Syntax colours are
already close together by necessity — pulling them toward a surface hue costs
about a third of the perceptual separation between the six, and roughly half if
they are mapped onto the status and brand roles instead. And the failure mode is
silent: nobody reports that code became harder to read, they just read it less
carefully. On a surface whose whole job is monitoring, that is the worst kind of
regression.

Mapping syntax onto the four existing roles was considered and rejected outright.
It looks like the most obedient reading of Five Roles and does the most damage:
a green string literal is not *online* and an amber number is not *needs
attention*, so it teaches the eye that status colour is decorative. Recorded as
`OQ-4`, answered 2026-08-19.

---

## 3. Typography

**Font:** Inter Variable (`@fontsource-variable/inter`). **Mono:**
`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.

> This scale is a **new decision**, not mirrored from the app — the previous
> doctrine's scale was prose-only and never had a CSS counterpart. It is tuned
> denser than shadcn's defaults because this is a monitoring surface.

| Role | Size | Weight | Line height | Used for |
|---|---|---|---|---|
| Display | 1.75rem / 28px | 650 | 1.15 | Page titles only |
| Headline | 1.0625rem / 17px | 650 | 1.3 | Section and card titles |
| Title | 0.9375rem / 15px | 600 | 1.35 | Dialog headers, row names |
| **Body** | **0.8125rem / 13px** | 400 | **1.6** | Default. Prose, descriptions, chat |
| Meta | 0.75rem / 12px | 400 | 1.45 | Timestamps, secondary row info |
| Label | 0.6875rem / 11px | 700 | 1.3 | Uppercase, `0.08em` tracking. Column and nav headings |
| Mono | 0.75rem / 12px | 400 | 1.5 | IDs, paths, commands, code |

**Named rule — Reading Width.** Prose and agent output cap at **68ch**. This
applies to Chat and any long-form panel; it does not apply to tables.

**Named rule — Tabular Numerals.** Anything compared down a column — durations,
counts, costs, percentages — uses `font-variant-numeric: tabular-nums`.

---

## 4. Spacing & layout

Base unit **4px**. Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 48`.

- **Card padding** 20px. **List row padding** 10px vertical / 12px horizontal.
- **Row height** targets 48px for two-line rows, 36px for single-line.
- **Page gutter** 20px; content max-width **1280px**, centred.
- **Reading column** 68ch (~520–620px) for prose surfaces.

Breakpoints that matter: **768px** (sidebar collapses to icons), **1100px**
(secondary panels stack), **1440px** (content stops growing).

---

## 5. Elevation & depth

**Flat by default.** Depth comes from a 1px `--border` plus a background
lightness step (`--background` → `--card` → `--accent`). This is what the code
already does, and it is now a chosen rule rather than an inherited one.

**The one exception:** genuinely floating surfaces — popovers, dropdown menus,
command palettes, toasts, and modal dialogs — take
`0 8px 30px -12px oklch(0 0 0 / 45%)`. Nothing anchored in the page gets a
shadow.

**Named rule — Flat by Default.** A shadow on a card, panel, row, or button is
a defect. If it floats above the page, it may have one; otherwise it may not.

---

## 6. Iconography

**Mandatory section.** Its absence is what made the app read as plain: the
previous doctrine banned "decorative icons" and agents correctly generalised
that to *no icons in content at all*, leaving iconography only in the sidebar.

**Set:** `lucide-react` (already a dependency, in use across 59 files). Do not
introduce a second icon set. Provider logos are the sole exception — those are
external brand marks, not icons.

| Context | Size | Stroke |
|---|---|---|
| Inline with body text | 12px | 2 |
| Nav items, buttons, row actions | 14px | 2 |
| Inside avatar/entity tiles | 16px | 1.8 |
| Empty-state centrepiece | 24px | 1.5 |

**Colour:** `--muted-foreground` by default. An icon takes `--brand` only when
its control is active, and a status colour only when it *is* the status
indicator.

### Semantic map — one concept, one icon, everywhere

| Concept | Icon | Concept | Icon |
|---|---|---|---|
| Machine / runtime | `Monitor` | Agent | `Bot` |
| Run / execute | `Play` | Pipeline | `Workflow` |
| Memory | `Brain` | Skill | `Puzzle` |
| Team / squad | `Users` | Project | `FolderKanban` |
| Task board | `ListChecks` | Chat | `MessagesSquare` |
| Inbox | `Inbox` | Schedule | `CalendarClock` |
| Terminal | `TerminalSquare` | Settings | `Settings` |
| Drill into detail | `ChevronRight` | Tool call | `Wrench` |
| Thinking / reasoning | `Brain` | Approval needed | `ShieldQuestion` |

**Entity tile pattern.** Any first-class entity — a machine, an agent, a team —
is represented by a **32px rounded-square tile** (`--radius-md`, `--accent`
background) holding its 16px semantic icon, with an **9px status dot overlapping
the lower-left corner**, ringed 2px in the parent surface colour. This is the
single most important visual pattern in the app: it makes an entity
recognisable and its state readable in one glance, without reading a word.

**Named rule — Icons Identify or Indicate.** Every icon either says *what a
thing is* or *what state it is in*. An icon that does neither is decoration and
must be removed. This is the deliberate reversal of the retired doctrine —
*decorative* icons remain banned; *functional* ones are now required.

---

## 7. Motion

**Mandatory section.** The app previously had four animations and no rules, so
agents shipped none, and the result felt inert.

Motion explains state change. It shows where a thing came from, that work is
happening, or that something arrived. Nothing moves for delight alone.

| Movement | Duration | Easing | Applies to |
|---|---|---|---|
| Micro-feedback | 110ms | `cubic-bezier(.2,0,.15,1)` | Hover, focus ring, button press |
| State change | 140ms | `cubic-bezier(.4,0,.2,1)` | Status change, selection, badge swap |
| Panel / menu | 180ms | `cubic-bezier(.32,.72,0,1)` | Sheets, dropdowns, nested menus, drawers |
| Entrance | 200ms | `cubic-bezier(.3,.7,.4,1)` | Row insert, toast, transcript turn |
| Ambient | 1s, loop | `ease-in-out` | Thinking indicator, streaming pulse |

The four existing keyframes in `packages/ui/src/styles/globals.css`
(`spg-slide-in-right`, `spg-fade-in`, `spg-pulse`, `spg-turn-in`) already fit
this table and are the reference implementation. **Nested menus follow the
Supabase pattern** — the panel slides from the direction it belongs to, so the
hierarchy stays legible.

**Named rule — Motion Explains.** Every animation answers "what just changed?"
or "is something happening?". Decorative motion — parallax, hover lifts on
static cards, entrance staggering for its own sake — is not permitted.

**Named rule — Reduced Motion.** Under `prefers-reduced-motion: reduce`, all
movement collapses to opacity-only at 100ms. Ambient loops stop entirely.

---

## 8. Component vocabulary

**Library: shadcn/ui via `@sparstrow/ui`.** Never hand-roll a primitive the
registry ships. Check with the `shadcn` MCP before composing one — `@sparstrow/ui`
currently has **26 of the registry's 61**.

Default reaches:

| Job | Use |
|---|---|
| List row | `item` *(not yet installed)* — the row pattern is currently hand-rolled |
| Detail panel | `sheet` *(not yet installed)* |
| Confirmation | `ConfirmDialog` (existing, in `@sparstrow/ui`) |
| Status indicator | Entity tile + dot (§6), or `Badge` for inline state |
| Empty state | `empty` |
| Loading | `skeleton`, shaped like the real content — never a spinner |

### 8.1 Chat renders as a reading column, not bubbles

**Agent output is typeset text in a centred 68ch column with no container.**
Only the human's turn gets a bubble. This is deliberate: agent output carries
code blocks, thinking traces, tool chips, and approval cards, and a bubble
fights all four.

### 8.2 The AI-native layer — not in any library, must be built

Sparstrowgen is an agent platform missing the components an agent platform is
made of. These have **no shadcn equivalent** and are first-class work:

| Component | Purpose |
|---|---|
| **Approval card** | The HITL gate — what the agent wants, why, and the decision |
| **Thinking trace** | Collapsible reasoning steps with elapsed time |
| **Tool chip** | A compact tool call / file edit |
| **Streaming text** | Progressive reveal with inline source references |
| **Context card** | A retrieved memory chunk and its source |
| **Task rows** | Live run status: running / waiting / failed / done |

The **approval card is the most important surface in the product** — it is the
moment a human is asked to take responsibility for what an agent is about to
do. It must be impossible to miss and impossible to approve by accident.

---

## 9. Navigation model

**Two separate mechanisms, not one.** They were conflated in the original ask
and have to stay distinct or agents will build one when the other was meant.

| | Answers | Lives | Precedent |
|---|---|---|---|
| **Tab strip** | *Which entity's profile is open?* | Top of the app shell | New — didn't exist before this doctrine |
| **Side sub-nav** | *Which section of THIS entity?* | Inside a profile | Extends `project-detail.tsx`'s existing sidebar tabs (Rules/Memory/Schedule/Files), promoted from a sidebar panel to the primary view |

Verified working end to end in `design-brief/entity-profile-board.html`
2026-08-18 — opening a machine, switching its sub-nav, navigating away, and
back, preserves that tab's state exactly.

### 9.1 The tab strip contract

- **One tab per open entity.** Clicking a row for an entity that already has a
  tab open focuses that tab — it does not duplicate it.
- **Every tab preserves its own state** (active sub-nav section, scroll
  position, in-progress form input) independent of every other tab and of the
  underlying list view.
- **Closable**, always, with an explicit control — never only by navigating
  elsewhere.
- **Every tab's label is unique on screen.** A profile tab and a tab spawned
  from an action inside it (a chat, say) must not read identically — qualify
  the second with what it is (`workshop-desktop — chat`), not just what it's
  about. Two tabs reading "workshop-desktop" with nothing to tell them apart
  was a real defect found while building the board, not a hypothetical.

### 9.2 Opening a tangential action — smart default, modifier override

An action inside a profile that leads somewhere else (starting a chat,
opening a related entity) does not ask every time. It has a sensible default,
and a modifier key overrides it per click — the same convention browsers and
IDEs already use, which is why it needs no on-screen teaching:

| Trigger | Destination |
|---|---|
| Plain click | The action's default — full reading-column work (a chat) defaults to **new tab**; a quick single-field confirm defaults to **centre modal** |
| `⌘`/`Ctrl` + click | Force **new tab** |
| `⇧` + click | Force **centre modal** |

**Named rule — Destination Fits Content.** A surface with a scrolling
reading-column body (§8.1) belongs in a tab, never a modal — a modal that has
to scroll a whole conversation inside it fights the Reading Width rule. A
single field or a yes/no confirmation belongs in a modal, never a tab — a tab
for one input is a click spent for nothing gained.

### 9.3 Accessibility — mandatory, not a follow-up pass

The first version of the board proved the interaction model with plain
`<div>`s: no keyboard focus, no ARIA role, on any of the list rows, tab strip,
or sub-nav. That was acceptable for a throwaway prototype and would not be
acceptable shipped. Any real implementation of this pattern requires, from the
first commit:

- Tab strip: `role="tablist"` on the container, `role="tab"` and
  `aria-selected` on each tab, roving `tabindex` (one tab in the strip is
  tabbable at a time; arrow keys move focus between them, matching the
  standard tablist pattern).
- Every list row and sub-nav item is a real focusable, keyboard-activatable
  control — a `button` or equivalent, never a `div` with only a click
  handler.
- Closing a tab is reachable from the keyboard, not only a mouse-only ×.
- Centre modal: `role="dialog"`, `aria-modal="true"`, focus moves into it on
  open, `Escape` closes it, and focus returns to whatever triggered it on
  close.
- A screen reader user is told when a new tab opens and which one is now
  active — a silent DOM change here is invisible to them.

### 9.4 Rollout — one entity at a time, proven before generalised

This pattern ships to **Machines first** — it already has a real gap (DD-003:
no detail view exists at all) and nothing to regress. Once proven there:

- **Agents next.** Same shape of gap as Machines — only a list and a create
  form exist today, no detail page — so this is greenfield, not a migration.
- **Projects last, and carefully.** `project-detail.tsx` already has a
  *working* tabbed detail view today. Moving it into the tab-strip pattern is
  a migration of real, live functionality, not a greenfield build, and carries
  real regression risk that Machines and Agents don't. Do not start here.

Each entity gets its own `frontend-verify` pass before the next one starts —
the same discipline this doctrine's own drafting used throughout.

---

## 10. The four states

Every surface ships Populated, Empty, Loading, and Error together. A surface
with only a populated state is not finished.

- **Empty** — say what to do next and offer the control that does it. Never a
  bare "No items." This is what a new user sees first.
- **Loading** — `skeleton` shaped like the real content.
- **Error** — what failed, in plain words, plus the next action.
- **Populated** — must be checked at realistic volume, not three rows.

---

## 11. Named rules

1. **Three Roles** — every colour is brand, status, or provider identity (§2.1).
2. **Status Is Not Themeable** — semantic colour never changes with theme (§2.1).
3. **Contrast Floor** — every preset clears 4.5:1 on every surface, both modes (§2.3).
4. **Reading Width** — prose caps at 68ch (§3).
5. **Tabular Numerals** — anything compared down a column (§3).
6. **Flat by Default** — shadows only on genuinely floating surfaces (§5).
7. **Icons Identify or Indicate** — no decorative icons; functional ones required (§6).
8. **Motion Explains** — no decorative motion (§7).
9. **Reduced Motion** — opacity-only at 100ms, ambient loops stop (§7).
10. **Four States** — every surface, always (§10).
11. **One Tab Per Entity** — no duplicate tabs for the same open entity (§9.1).
12. **Distinguishing Labels** — no two open tabs may read identically (§9.1).
13. **Destination Fits Content** — reading-column content in a tab, single
    inputs in a modal, never the reverse (§9.2).

---

## 12. Do / Don't

**Do**

- Use semantic tokens (`bg-background`, `bg-card`, `border-border`,
  `text-foreground`, `text-muted-foreground`) — never a raw hex or a Tailwind
  palette class.
- Give every entity its tile + status dot (§6) so state is readable at a glance.
- Check the `shadcn` registry before building any primitive.
- Verify new UI in **both modes and at least Paper and Mono** — Mono is the
  honest worst case, because it has no surface tint to hide behind.
- Build any tab strip or sub-nav as real focusable controls with the ARIA
  roles §9.3 names, from the first commit — not retrofitted after.

**Don't**

- Don't let a user-chosen accent carry meaning. Brand is identity, never state.
- Don't put agent output in a chat bubble (§8.1).
- Don't use a spinner where a skeleton fits.
- Don't add a colour, icon, or animation without being able to name its job.
- Don't migrate `project-detail.tsx`'s working tabs into the new tab-strip
  pattern before Machines and Agents have each shipped and been verified (§9.4).
- Don't restate these rules in another skill, agent, or checklist — point here.
  A duplicated doctrine keeps enforcing itself after this file changes.

---

## 13. Deliberately undecided

Ask before inventing. An invented answer here becomes the de-facto standard by
the third screen that copies it.

- **Logo and wordmark.** `apps/web/public/` still holds the Next.js starter
  SVGs. No mark has been designed.
- **Provider logo assets.** The doctrine requires them (§2.1) and none exist in
  the repo. Sourcing and licensing is unresolved.
- **Data visualisation.** No chart palette. Blocked until the FinOps surface is
  specified — Vercel is the stated reference for it.
- **Density preference.** Whether users can choose compact/comfortable, in
  addition to surface and brand.
- **Empty-state illustration.** Multica uses small abstract previews; whether
  Sparstrowgen does is unresolved.
- **Tab strip visual design.** §9 specifies the contract (one tab per entity,
  unique labels, closable, ARIA roles) but not pixel-level chrome — height,
  icon-per-kind, overflow behaviour once many tabs are open.
- **Keyboard shortcut for closing a tab.** Browsers reserve `Ctrl/Cmd+W`; an
  in-app tab strip needs its own binding that doesn't collide with it.
- **What survives a page reload.** Whether open tabs persist across a refresh,
  and if so, per-device or synced to the user's account.

---

## 14. On Multica

Multica is a **direct competitor** in the same category — same nouns (Agents,
Runtimes, Skills, Squads), nearly the same navigation groups. It was studied
during this brief and informed §2.1, §6, and §8.1.

**Take the system, never the skin.** The colour discipline, functional
iconography, entity-tile pattern, and reading-column chat are sound structural
ideas and are adopted here. Its specific palette, spacing, and layout are not,
and Sparstrowgen's warm-dark Paper surface with an amber accent is deliberately
its own. A screen that would be mistaken for Multica's is a defect.
