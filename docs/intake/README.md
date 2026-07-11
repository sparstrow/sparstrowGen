# Intake

The single pool for everything you bring to the factory — captured by the
[Listener](../workflows/agents/listener.md), one item per thing, in one unified format,
regardless of category. **The front is unified; the back diverges** — each category then
routes into its own workflow (see [`../workflows/`](../workflows/)).

```
docs/intake/
  0001-agent-creator-draft-lost-2026-07-11.md
  0002-bulk-agent-import-2026-07-11.md
  done/      ← moved here when status: done
  assets/    ← screenshots, named to the capture id
```

## Naming

`NNNN-<title-slug>-<YYYY-MM-DD>.md` — global sequence, zero-padded id, date at the end
(append `-HHMM` if you want the time). Category is a **field, not a prefix**, so one sequence
covers all categories.

## Format

```
---
id: 0001
category: feedback          # feedback | new-feature | new-concept | design | feature-change
status: under-review        # under-review → done   (done ⇒ moved to done/)
project: factory            # factory (self) | <project-slug>
surface: Agents / Agent Creator
date: 2026-07-11 14:30
screenshots: [assets/0001-draft-gone.png]
links: {}                   # { review, plan, pr } — filled in as they appear
resolution:                 # set at done: shipped | wontfix | dup | deferred
---

## What I brought (verbatim)
<your words, minimally cleaned. SACRED — later work appends below, never rewrites this.>

## What the Listener understood
<the confirmed one-liner>

## Blind-spot notes (accepted)
<only if you asked "what do you think?" and accepted a suggestion>
```

## Lifecycle

- **`under-review`** — captured and live in the pool, moving through its category's workflow
  (feedback → investigate; new-feature/concept → the review spine; design → decode + SPEC).
- **`done`** — resolved: a `resolution:` + a link to the fix (PR/commit), then the file is
  **moved to `done/`**. Closed items (wontfix / dup / deferred) also go to `done/` with the
  resolution recorded; deferred ones are additionally logged in
  [`../../DEFERRED_SCOPE.md`](../../DEFERRED_SCOPE.md).

Nothing is ever deleted. `done/` is the audit trail and a retro input. To see the open queue,
list the pool root (or, in-app, filter by `status`/`category`).

## Screenshots

Claude in chat can't save a pasted image (its write path is text, not binary). So: **you
paste → Claude views it → Claude gives you the exact filename + path → you save it there.**
e.g. `Save as: docs/intake/assets/0001-draft-gone.png`. In Sparstrowgen this is a native
upload, auto-named to the item id.

## The rules that make this trustworthy

- Capture ≠ analyze ≠ fix. Items land here with **no diagnosis** — deliberately.
- The verbatim block is sacred; `git log` shows the whole journey from capture to resolution.
- Even the Listener's blind-spot notes only enter after *you* accept them — your words stay
  the record.
