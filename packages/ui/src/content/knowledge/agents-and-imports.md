---
title: Agents & Imports
section: Surfaces
description: Manage your agent roster, view skills, and safely ingest external skill packs through quarantine.
order: 2
updated: 2026-07-13
---

## The Agents page

Your full roster. From here you can:

- **Create** — via the interview or the manual form
  (see [Create your first agent](/knowledge/create-your-first-agent)).
- **Duplicate** — clone an agent as a starting point for a variant.
- **Inspect skills** — click a skill to open the **Skill Viewer** slide-over and read
  exactly what document the agent is working from.
- **Edit** — prompt, model, tools. Changes apply to *future* runs only; running and past
  runs keep the policy snapshot they started with.

System agents (the factory's own internal workers — indexers, consolidators, planners)
are hidden from this list on purpose; you manage your workforce, not the plumbing.

## The Imports page — external skills, quarantined

Importing someone else's skill pack is a supply-chain risk, so it never lands directly
in your roster:

```
source repo → Extractor (reads & converts)
            → QUARANTINE (inert — cannot run, cannot be armed)
            → Skill Specter (static safety check, produces a report card)
            → you review → Promote  → normal agent in your roster
                         → Discard → gone
```

Each quarantined item shows its report card: what the skill does, what it asks for, and
anything the checker flagged. **Nothing in quarantine can execute** — not even via
direct API edits; promotion is the only door out.

## Notes & limitations

- Promotion is deliberate and manual. There is no "trust this source" bypass.
- Duplicate detection at creation is advisory — the factory warns about near-copies but
  never blocks you.
