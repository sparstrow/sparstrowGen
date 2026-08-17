---
name: design-system
description: >-
  Creates and maintains a browsable, file-based design system for any app —
  tokens, foundation cards, component cards with agent-readable usage notes,
  and live prototypes, all rendered into one self-contained index.html plus an
  optional in-app route. Use this skill whenever the user mentions a design
  system, design tokens, a component library or component inventory, style
  guide, UI documentation, design foundations (color/type/spacing/motion/
  radius/shadow), keeping design and code in sync, or design drift — and also
  when they want to start a new app's visual language from scratch, document
  the UI an existing app already has, or check whether the documented design
  still matches the real code. Works on greenfield projects with no code yet
  and on established codebases with an existing component library.
license: MIT
metadata:
  entry-script: scripts/ds.mjs
  produces: design-system/
---

# Design system

A design system here is **not a document and not a single HTML file.** It is a
folder of small, self-contained files following a strict naming convention,
plus a generator that walks them and produces one browsable page. That split is
what makes it survive: any individual card can be opened, edited, or deleted on
its own, and the index is always derivable rather than hand-maintained.

Read [references/file-conventions.md](references/file-conventions.md) before
creating or editing anything — it defines the four file suffixes that carry all
the meaning. The rest of this file covers *when* to do what.

## The two modes

The single most consequential decision is which mode you are in. Get it wrong
and you either duplicate a component library that already exists, or you
document components that do not.

| | **Greenfield** | **Mirror** |
|---|---|---|
| When | New app, or an app with no component layer worth documenting | An app that already has a component library |
| Source of truth | **The design system.** Components are authored here and graduate into app code later | **The app's real code.** The design system documents it |
| Component files | Cards + `.prompt.md` + implementation (`.jsx`/`.d.ts` when the target is React; HTML-only otherwise) | Cards + `.prompt.md` only — never a second implementation |
| Tokens | Authored in `tokens/*.css` | Mirrored from the app's real stylesheet, fingerprinted in `system.json` |
| Drift check | Structural only (orphans, uncarded prototypes) | Full — token values and component sources are diffed |

**Detect the mode rather than asking, when the evidence is clear.** Look for a
component directory (`components/ui/`, `src/components/`, a `packages/ui`
workspace), a `components.json`, or a stylesheet defining custom properties. If
you find a real component library, you are in mirror mode. If the repo is empty
or has no UI layer, greenfield. Only ask when the evidence genuinely conflicts —
for example a codebase mid-migration with two component directories.

**Never author a duplicate component in mirror mode.** A second `Button` that
looks right today will drift, and a design system that lies about the code is
worse than no design system — someone builds against the card, ships, and it
does not match. In mirror mode the deliverable is the *card plus the usage
notes*, not a reimplementation.

## The CLI

`scripts/ds.mjs` is zero-dependency Node 18+. It never needs installing and
must stay dependency-free so it runs in any repo regardless of stack.

```bash
node <skill>/scripts/ds.mjs init  --root design-system --name "App Name" \
     [--mode mirror|greenfield] [--token-source path/to/globals.css] \
     [--component-source path/to/components]

node <skill>/scripts/ds.mjs add   --root design-system --kind component \
     --name Button --group buttons [--source path/to/button.tsx]
node <skill>/scripts/ds.mjs add   --root design-system --kind guideline --name "Type Scale"
node <skill>/scripts/ds.mjs add   --root design-system --kind prototype \
     --name "Sales Orders" --category "ERP App"

node <skill>/scripts/ds.mjs build --root design-system   # → index.html
node <skill>/scripts/ds.mjs watch --root design-system   # rebuild on change
node <skill>/scripts/ds.mjs check --root design-system   # drift report, exit 1 on drift
node <skill>/scripts/ds.mjs sync  --root design-system   # reset drift baseline
```

Passing `--source` on a component in mirror mode is what registers it for drift
detection. A card added without `--source` is invisible to `check`, and `check`
will say so.

`sync` is the one command that can hide a problem: it re-records fingerprints so
drift stops being reported. Only run it *after* the cards and usage notes were
actually updated to match the new reality — otherwise it converts a real warning
into silence.

## Creating a system

1. **Establish the mode** (above) and find the sources. In mirror mode locate the
   real token stylesheet and component directory; note whether the project has a
   written design doc (`DESIGN.md`, brand guidelines) to draw the prose from.
2. **`init`.** In mirror mode pass `--token-source` so the tokens are captured
   and fingerprinted from the start.
3. **Fill `tokens/`.** Mirror mode: `@import` or copy the real values, and say in
   a comment which file they came from. Greenfield: author them — see
   [references/greenfield-mode.md](references/greenfield-mode.md) for a starting
   scale that is coherent rather than arbitrary.
4. **Write foundation cards** for what the system actually decides: color
   surfaces, foreground/text hierarchy, brand/primary, status colors, type
   scale, spacing scale, border radius, shadows, borders/dividers, motion. A
   foundation with no card is a decision nobody can see.
5. **Write component cards**, one per component or tight family (buttons,
   badges, form fields, avatar+tabs). Register each with `--source` in mirror
   mode.
6. **Write `README.md`** — this becomes the page's masthead and is the highest-
   value prose in the system. See
   [references/readme-structure.md](references/readme-structure.md).
7. **`build`**, open `index.html`, and look at it. A card that renders wrong in
   the viewer renders wrong everywhere.

## What makes a card worth having

A card that shows one default state teaches nothing the component's own source
does not already say. The value is in the comparison — every variant beside
every other, and the states you cannot see by reading a prop table:

- **Every variant**, laid out side by side and labelled.
- **Every state** that exists: default, hover, focus-visible, disabled, error,
  loading, empty. Focus-visible especially — it is the one designers skip and
  keyboard users depend on.
- **Real content**, not `Lorem ipsum`. Use plausible domain data: an actual
  order number, a real-length customer name, a currency figure. Fake-but-real
  content exposes truncation, alignment, and tabular-numeral problems that
  placeholder text hides.
- **Labelled rows.** A left-hand label column (`VARIANTS`, `SIZES`, `STATES`)
  turns a pile of specimens into a reference.

Cards render inside sandboxed iframes, so each one carries its own `<style>` and
cannot break the page around it. Keep them small and self-contained.

## `.prompt.md` — the part that makes this machine-readable

Every component card should have a sibling `.prompt.md`. This is what an agent
reads before using the component, and it is the reason this system is more than
a gallery. Write what the source code *cannot* say:

- Which variant means what, semantically — a `variant → meaning` table is the
  single most useful thing here. `bad` means overdue/blocked/negative, not "red".
- Which combinations are wrong, and why.
- Copy-pasteable usage in the project's real syntax.
- The gotcha someone hit once. That is the line that saves the next person.

Prop lists mostly belong in types, not here. If the project has TypeScript, the
types already carry the signature; the usage notes carry the judgment.

## Maintaining it

This is the half that decides whether the system is alive in six months.

- **`check` on a schedule and before shipping UI work.** It reports tokens that
  changed in the real stylesheet, components whose source changed since the card
  was written, cards pointing at deleted files, prototypes with no preview card,
  and cards with no registered source. Exit code 1 means drift, so it wires into
  CI directly.
- **When `check` reports a changed component**, re-read the source, update the
  card and usage notes to match, then `sync`. Do not `sync` first.
- **`add` for anything new** rather than regenerating. The system accumulates;
  regenerating loses hand-written usage notes, which are the expensive part.
- **Record it in `CHANGELOG.md`** — new components, token changes, prototypes
  added. Newest first, dated. Design decisions get relitigated constantly and
  the changelog is what settles them.

Treat a stale card the way this repo treats stale docs: as a defect, not
housekeeping. See [references/mirror-mode.md](references/mirror-mode.md) for the
full drift workflow.

## Viewing

**`index.html` is the primary view** — self-contained, no server, no
dependencies. Open it directly or serve the folder. It works for a greenfield
app with no build system at all, which is the whole reason it is primary.

**An in-app route is the optional second view**, worth adding only for a running
React app where seeing the *real live components* (rather than static cards)
earns the extra maintenance. It needs a hand-written registry mapping card ids
to render functions — it cannot be derived, so it is real ongoing cost. See
[references/app-route.md](references/app-route.md). Do not build it for a
greenfield project; there is nothing live to show yet.

## Prototypes

Full clickable prototypes (`.dc.html`) live in `designs/<Category>/` alongside a
preview card, so exploration and the system that governs it stay in one place —
a prototype in a scratch folder somewhere drifts from the tokens immediately.

Creating them is the **`interactive-prototype`** skill's job, not this one. This
skill owns the folder they land in, the tokens they consume, and the preview
card that surfaces them in the index.

## Scope boundaries

- Do not build production application code. This skill produces a design system
  and its viewer; shipping the design into the app is the app's own build work.
- Do not invent tokens in mirror mode. If the real stylesheet has no
  `--shadow-lg`, the system does not get to claim one.
- Do not document a component that does not exist, or a variant that is not
  implemented. Aspirational documentation sends people to a prop that throws.
