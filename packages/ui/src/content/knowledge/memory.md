---
title: Memory
section: Surfaces
description: The markdown vault — scopes, typed notes, wikilinks, search, quarantine, and the nightly dream cycle.
order: 10
updated: 2026-07-13
---

Memory is what makes agents *yours*: a vault of markdown notes that agents read before
they work and write to as they learn. The Memory page is the vault browser.

## Scopes — who sees what

```
global                     every agent, everywhere
├─ project: <name>         agents working in that project
│   └─ agent: <name>       one agent within it
└─ inbox                   new machine-written notes awaiting triage
```

Notes are injected into runs by relevance *within scope* — a project note never leaks
into an unrelated project's runs. Sandbox projects are walled off entirely.

## Typed notes

Every note has a type — `note`, `decision`, `architecture`, `pitfall`, `meeting`,
`lesson` — so the vault distinguishes "we decided X" from "watch out for Y". Filter by
type in the browser; agents can save with a type too.

## Wikilinks & backlinks

Link notes with `[[Note Title]]`. Links become real edges: each note shows its
**backlinks** (what points at it), and renaming degrades gracefully rather than
breaking. Your vault becomes a graph, not a pile.

## Search & synthesis

Search is **hybrid** — meaning (vectors) + keywords (full-text) at once. Toggle
**Synthesize** to get a cited answer *composed from* the matching notes (with named
gaps) instead of a raw hit list. Synthesis degrades to plain hits if the model is
unavailable — search never errors out.

## Quarantine — untrusted writes

Notes written by **untrusted runs** (sandboxes, delegated subtasks, runs that touched
external web content) don't enter the vault directly — they're quarantined, invisible
to agents, until you approve or reject them in the review strip. Machine-written noise
can be bulk-deleted.

## The dream cycle (opt-in, per project)

Nightly, a consolidator agent tidies each opted-in project's memory:

- **Merges** near-duplicate notes (originals are soft-archived with citations, never
  destroyed).
- **Flags contradictions** — conflicting pairs surface in the Dashboard attention queue
  for you to resolve.
- Writes a **daily digest** to the inbox of what it did.

A global nightly budget caps what the cycle can spend.

## Notes & limitations

- Nothing is hard-deleted by machines: merges archive, quarantine holds, only you
  destroy.
- Injection is budgeted — an agent sees the most relevant slice, not the whole vault;
  the run page's memory panel shows exactly what made the cut.
