---
title: Dashboard
section: Surfaces
description: The attention queue, live workforce view, and PR queue — your morning screen.
order: 1
updated: 2026-07-13
---

The Dashboard is the *"what needs me?"* screen. Open it first; if it's quiet, the factory
is running itself.

## Attention queue

The centerpiece. Anything that needs a human decision stacks here:

- **Blocked runs** — an agent hit a question it can't answer. Reply in the inline
  composer and the run wakes up and continues.
- **Delegation approvals** — an agent wants to spawn sub-agents; approve or deny
  (see [Delegation & swarms](/knowledge/delegation-and-swarms)).
- **Memory contradictions** — the nightly dream cycle found two notes that disagree;
  pick the survivor (see [Memory](/knowledge/memory)).

The amber badge on the Dashboard nav item (and the “waiting” chip in the header, visible
from any page) counts open attention items.

## PR queue

An aggregate list of open pull requests across every project with a git remote — so
agent-produced branches waiting on your review are visible without visiting each project.

## Notes & limitations

- The attention queue is the factory's *only* escalation channel — if you ignore it,
  blocked runs stay blocked; nothing times out silently or answers itself.
- The queue count updates live over the local WebSocket; “offline” in the header means
  the core service is unreachable and the queue may be stale.
