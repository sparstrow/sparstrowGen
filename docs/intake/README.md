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
category: feedback          # feedback|new-feature|new-concept|design|feature-change (intake-track)
                             # decision|pitfall|lesson|meeting|architecture (memory-track)
status: captured             # see Lifecycle below
project: factory            # factory (self) | <project-slug>
surface: Agents / Agent Creator
date: 2026-07-11 14:30
screenshots: [assets/0001-draft-gone.png]
links: {}                   # { review, proposal, plan, pr, memory_note } — filled in as they appear
resolution:                 # set at done: shipped | wontfix | dup | deferred | persisted
---

## What I brought (verbatim)
<your words, minimally cleaned. SACRED — later work appends below, never rewrites this.>

## What the Listener understood
<the confirmed one-liner>

## Blind-spot notes (accepted)
<only if you asked "what do you think?" and accepted a suggestion>

## Curator session
<appended by the Curator — before/after summary, confirmed mode, verdict. See
../workflows/review-and-routing.md>
```

## Lifecycle

Every capture passes through the [Curator](../workflows/agents/curator.md) before it's
considered "in progress" — see [`../workflows/review-and-routing.md`](../workflows/review-and-routing.md)
for the full state diagram. Summary:

```
 SHARED                    INTAKE-TRACK                       MEMORY-TRACK
 captured → locked ─────▶  routed ──────────▶ done            scoped ────▶ done
                           gap ──▶ Pipeline
                                   Suggester ──▶ you decide
```

- **`captured`** — Listener wrote it, awaiting the Curator.
- **`locked`** — the Curator's session is done: mode confirmed (or changed, visibly), plan
  locked, you've confirmed the before/after summary.
- **`routed`** *(intake-track)* — a pipeline exists; the item is progressing through that real
  workflow.
- **`gap`** *(intake-track)* — no pipeline exists; [Pipeline Suggester](../workflows/agents/pipeline-suggester.md)
  has proposed extend-existing vs. build-new. You decide: build it now (→ eventually `routed`)
  or park it (→ `done`, logged in [`../../DEFERRED_SCOPE.md`](../../DEFERRED_SCOPE.md) as
  `source: review-outcome`).
- **`scoped`** *(memory-track)* — the [Memory Archivist](../workflows/agents/memory-archivist.md)
  proposed a write scope (agent/project/global) and you confirmed it.
- **`done`** — resolved: a `resolution:` + a link (PR/commit for intake-track, the memory note
  for memory-track), then the file is **moved to `done/`**. Closed items (wontfix / dup /
  deferred) also go to `done/` with the resolution recorded.

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
