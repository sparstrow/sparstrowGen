---
title: Delegation & swarms
section: Concepts
description: Agents spawning agents — least-privilege inheritance, your approval gate, and the runaway brakes.
order: 3
updated: 2026-07-13
---

A working agent can decide its task is really three tasks and **delegate** — spawning
subtasks for other agents. That's the swarm capability. It's powerful, so it ships with
strong brakes.

## How a delegation flows

```
parent run ──▶ requests subtask ──▶ YOUR APPROVAL (attention queue)
                                        │ approve
                                        ▼
                              child task + child run
                              (parent suspends, resumes on completion)
```

- **You approve or deny** each delegation from the Dashboard attention queue; a denial
  returns to the parent as an answer, not a crash.
- While children work, the parent **suspends** — it isn't burning tokens waiting.
- Agents assigned together this way appear as an **ephemeral team**, so the whole
  effort reads as one unit in the UI.

## The safety model

- **Least privilege, structurally:** a child's tool policy is the *intersection* of what
  its agent allows and what the parent run had. A parent without shell access can never
  spawn a child that has it — privilege can only narrow down a delegation chain.
- **Depth cap:** chains can't nest indefinitely (children spawning children spawning
  children).
- **Circuit breaker:** repeated delegation failures trip a breaker that halts further
  spawning instead of retrying forever.

## Notes & limitations

- Delegated runs are **untrusted** by default: their memory writes go to quarantine for
  your review (see [Memory](/knowledge/memory)).
- Every child is a full run in [Runs](/knowledge/runs-and-transcripts) — cost and
  transcripts are per-child, so a swarm's true cost is always visible.
- Approval is per-delegation. There is deliberately no "auto-approve all" switch.
