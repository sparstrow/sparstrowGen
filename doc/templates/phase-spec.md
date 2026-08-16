<!--
TEMPLATE — copy to doc/tasks/<phase>/README.md, then delete every HTML
comment in the copy.

A phase spec holds what ALL of a phase's tasks share, so a decision is written
once and referenced — not copy-pasted into eight files and then updated in six.
If exactly one task needs a decision, it belongs in that task, not here.

Write this BEFORE the individual tasks. Decomposing a phase is where the real
design happens: every phase in this repo so far has surfaced load-bearing
decisions that were invisible from the plan's bullet list.
-->

# <Phase id> — <name>

| | |
|---|---|
| **Plan** | <doc/plans/<file>.md (<phase id>)> |
| **Depends on** | <phases that must land first, or —> |
| **Blocks** | <phases waiting on this, or "nothing"> |
| **Status** | <not started \| NN–NN done <date> \| ✅ done <date>> |
| **Open questions** | <none \| OQ-n, blocking only task NN> |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on | Status |
|---|---|---|---|
| [<T-id> — <name>](<file>.md) | `<[S]\|[P]\|[C]>` | <— or task ids> | <not started> |

<!--
Tags — exactly one per task, defined in ../README.md:
  [S] Sequential — blocks dependents, run alone
  [P] Parallel   — no shared files with siblings, hand to different agents
  [C] Concurrent — any order, but touches shared files, one worker at a time

The practical test for [P] vs [C]: could two agents start these RIGHT NOW
with zero coordination? If they'd collide on a file, it's [C].

Every phase should end with a verification task tagged [S] — see
verification-task.md.
-->

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

<!--
What this phase delivers, in a few sentences. Not the plan's framing repeated —
the concrete shape of the work now that someone has read the code.
-->

## The shape of what was found

<!--
DELETE if decomposition turned up nothing surprising — but check honestly
first, because it usually does.

This section is for things established by READING THE CODE that change the
work from what the plan assumed: a premise that stopped being true, a piece
already built, an adapter that solves half the problem, a route name the plan
got loose about.

This is the highest-value section in a phase spec. M7's version caught that
"point the desktop window at the hosted app" assumed a deployment nobody had
made; M5's caught a dead WebSocket and an unpaginated transcript. Both would
have been discovered anyway — halfway through implementation, at much higher
cost.
-->

## Definition of done

<!--
The observable outcomes, as a list. Each one either happened or didn't — no
"improved", no "better". If a reader can argue about whether an item is met,
rewrite it.

End with what is explicitly NOT in this phase, pointing at the decision that
excluded it. That sentence is what stops the next agent scope-creeping.
-->

- <observable outcome>
- `pnpm typecheck` and `pnpm test` stay green

**Not in this phase:** <what, and which decision says so>

---

## Decisions already made

<!--
The shared decisions, each under its own ### heading with a claim as the
title — "The five routes are thin re-exports. Resist making them anything
else" beats "Routing approach".

Include the reasoning and the rejected alternative. A decision without its
"instead of what" gets re-litigated by the next agent who has a different
instinct.

Decisions INHERITED from the plan get cited, not restated. Only decisions made
here, during decomposition, get written out in full.
-->

### 1. <claim as the heading>

<!-- Reasoning, and what was rejected. -->

---

## The owner action this phase cannot do for itself

<!--
DELETE if there isn't one.

For work that is fully decided but needs a human: an account, a dashboard
setting, a secret. This is NOT an open question — nothing is undecided,
someone just has to go do it.

It needs a matching row in ../../runbooks/README.md, which is where the owner
actually goes to act on it. This section explains why the phase is exposed to
it; that file is the checklist.
-->

## Files

| Path | Change |
|---|---|
| `<path>` | <new \| edit — what changes> |

## Traps

<!--
Failure modes that would be hit otherwise, each with WHY it bites and what to
do instead. Bold the claim, explain underneath.

The traps worth writing are the ones that fail QUIETLY — a param that arrives
undefined and renders an empty state, a route that compiles and is linked from
nowhere. A loud failure teaches itself; a silent one gets shipped.
-->

## Verification

<!--
The assertions that matter, numbered. The full procedure lives in the
verification task; this is what it is graded against, stated once so the tasks
can point at it.
-->

Full procedure in [<T-id> — verification](<file>.md).
