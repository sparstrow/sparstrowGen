---
title: Tool permissions
section: Concepts
description: The four-layer policy that decides what any run may do — deny wins, empty inherits, snapshot at spawn.
order: 2
updated: 2026-07-13
---

Tools are what make agents powerful — and what make guardrails necessary. The factory
resolves every run's allowed tools from four layers:

```
Global defaults
   ▼ overlaid by
Agent policy          (what this worker may ever do)
   ▼ overlaid by
Project policy        (what's acceptable in this codebase)
   ▼ overlaid by
Task policy           (what this specific job needs)
   =
EFFECTIVE TOOLS       (frozen into the run at spawn)
```

Three rules govern the merge:

1. **Deny wins.** A tool denied at any layer is denied, full stop. A project can take
   away what an agent normally has; nothing below can give it back.
2. **Empty = inherit.** A layer that says nothing passes the layer above through
   unchanged. You only write policy where you want to change something.
3. **Snapshot at spawn.** The resolved set is frozen into the run when it starts.
   Editing an agent mid-run never changes a running run's powers — the run page's
   *effective tools* line shows exactly what was in force.

## Working with policies

- Leave agent tool lists **empty** by default — inherit, then restrict per project or
  per task when a job warrants it.
- Prefer **narrowing at the project layer** ("no shell in this repo") over maintaining
  many one-off agent variants.
- Delegated subtasks add a fourth force: a child can never exceed its parent — see
  [Delegation & swarms](/knowledge/delegation-and-swarms).

## Notes & limitations

- Tool names differ between providers (a CLI's editor tool vs the registry's) — policies
  apply per provider's tool naming; check the effective-tools line when mixing engines.
- Permissions govern *agents*. Your own [Terminals](/knowledge/terminals) are outside
  this system entirely.
