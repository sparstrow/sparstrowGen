<!--
TEMPLATE — copy to doc/tasks/<phase>/T-<phase>-<nn>-verification.md, then
delete every HTML comment in the copy.

Every phase ends with one of these, tagged [S]. It exists because running the
thing finds what reading the code cannot: M4 shipped four defects and M5 two
design corrections that only a verification pass caught.

What makes this different from the Verification section inside a normal task:
that one proves ONE task's work in isolation. This one proves the phase as a
product — the seams between tasks, what must NOT have changed, and the paths a
user actually takes.

The rule this task enforces: "done" must mean the same thing every time it is
written. An assertion ticked on weaker evidence than it asked for, with no
KnownGaps.md entry, devalues every other ticked box in the repo.
-->

# <T-id> — Verification

| | |
|---|---|
| **Tag** | `[S]` sequential — needs all of <phase> in place |
| **Depends on** | <the phase's other tasks> |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | <not started \| ✅ done <date> \| ⏸ not run — [`G-n`](../../KnownGaps.md)> |

## Objective

Prove the phase for real.

<!--
Then, up front, name what this pass CANNOT reach and why — a missing
deployment, a second machine nobody has, a browser pane that won't composite.

Naming it here rather than discovering it at the bottom is the difference
between a phase that reports honestly and one that quietly grades itself on
the half it could reach. Say which section is affected and where it gets
recorded (KnownGaps.md, following an existing entry's shape).
-->

## A — <the thing this phase built>

<!--
Group assertions by what they prove, one section per group. Every box is
something a person can do and observe, with an unambiguous result.

Reach things the way a USER reaches them. M7's spec says it precisely: reach
every detail page by clicking a row, never by typing a URL with a made-up id —
a fabricated id fails exactly the way a broken param does, so typing one
proves nothing.
-->

- [ ] <assertion — concrete enough that two people would agree on pass/fail>
- [ ] The browser console has no errors on load

## B — What must NOT have changed

<!--
The regression surface. A phase that adds four routes can break the two that
already worked, and a routing mistake tends to be systemic.

Include things that are SUPPOSED to keep failing. Deliberate 501s, disabled
buttons, features that refuse by design — a helpful-looking fix to one of
those is a regression, and this is where you catch someone having "improved"
it.
-->

- [ ] <thing that worked before still works>
- [ ] <deliberate refusal still refuses, with its message intact>

## C — <what can be verified today>

<!--
Split reachable from unreachable, so the unreachable half is visibly skipped
rather than silently absorbed. A dead port, a stubbed response, or a manually
inserted row often makes "unreachable" reachable — try before deferring.
-->

- [ ] <assertion>

## D — <what needs something that doesn't exist yet>

**Needs <the missing thing>.** Skip and record if there is not one.

- [ ] <assertion that can't be reached yet>

## E — Regression surface

- [ ] `pnpm -r typecheck` and `pnpm -r test` green
- [ ] <the affected package(s) build>

## On completion

- [ ] Tick <n.n>–<n.n> in [`../MasterTaskQueue.md`](../MasterTaskQueue.md) and
      mark Band <n> complete
- [ ] Update the phase `README.md` status line and its task table
- [ ] Update the plan's own **Status** row
<!--
If this is the plan's last phase and every phase reads done, the plan's status
becomes "✅ Completed <date>". It cannot, while any verification is unreached —
say WHICH gap is why rather than rounding up.
-->
- [ ] Knowledge Center pass per `AGENTS.md` §3.2 — including the four
      global-claim pages this phase never opened
- [ ] **Every unreached assertion above written into
      [`../../KnownGaps.md`](../../KnownGaps.md)** with what it would cost if
      the assumption is wrong, and the concrete thing that closes it

## Result

<!--
What was actually run, and what it found. Name the evidence — commands, what
was clicked, what was observed. A verification task whose Result says
"verified, all good" has failed at its one job.
-->
