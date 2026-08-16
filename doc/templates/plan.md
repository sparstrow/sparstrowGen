<!--
TEMPLATE — copy to doc/plans/<YYYY-MM-DD>-<slug>.md, then delete every
HTML comment in the copy.

A plan is the "what and why". Uncertainty IS allowed here — that is the whole
reason plans and tasks are separate files. Anything still undecided goes to
OpenQuestions.md with the AGENTS.md §8 options framework, and the plan says so
in its header rather than pretending the question doesn't exist.

Small plans stop after "Decisions". Multi-phase plans continue into
"Phases" and get a doc/tasks/<phase>/ folder each.
-->

# <Plan title> — <YYYY-MM-DD>

| | |
|---|---|
| **Status** | <Draft \| Approved <date> \| In progress — <phase> next \| ✅ Completed <date>> |
| **Trigger** | <who asked for this and why, in one line> |
| **Depends on** | <plans or phases this needs first, or —> |
| **Touches** | <the paths this will change> |
| **Tasks** | <doc/tasks/<phase>/ once decomposed, or "not decomposed yet"> |
| **Open questions** | <OQ-n, or "none"> |

<!--
Keep the Status row current. It is the first thing anyone reads, and a plan
whose phases are all done but whose status still says "In progress" is the
single most common form of drift in doc/. See doc/tasks/README.md's
"When a phase's tasks are fully completed" for exactly when to update it.
-->

## Why

<!--
The problem, in enough detail that someone who wasn't in the conversation
understands it. If this is a fix, describe what is actually wrong — observed
behavior, not a guess at the cause. If it's new capability, describe what
can't be done today.

Be concrete. "Auth is incomplete" says nothing; "there is no way to sign out,
and the menu item is hard-disabled with a tooltip left over from the
single-user design" tells the next reader where to look.
-->

## Decisions

<!--
The load-bearing choices, each with its reasoning. This is the most valuable
section in the file — six months from now the code shows WHAT was built, and
only this shows why the alternatives were rejected.

Format that works well: a bold claim as the lead sentence, then the reasoning
underneath. One paragraph per decision, numbered or ### headed if there are
more than about four.

State rejected options explicitly. "We chose X" is much weaker than "we chose
X over Y, because Y would have meant Z."
-->

## Phases

<!--
DELETE THIS SECTION for a single-shot plan.

One subsection per phase, each becoming a doc/tasks/<phase>/ folder when
decomposed. Say what the phase delivers and what it depends on — not how, that
is the task documents' job.

Mark phases done in place as they land (### M3 — pairing ✅ DONE 2026-08-10)
rather than deleting them.
-->

### <M-n> — <name>

<!-- What it delivers, what it depends on, and how you'll know it's done. -->

## Scope boundaries

<!--
What this plan deliberately does NOT do, and where each excluded thing went.
Naming the boundary is what stops the next agent "helpfully" building it.

Anything parked here gets a real entry: Deferred.md if it's agreed and
postponed, Ideas.md if it was merely noticed. Link the id.
-->

## Verification

<!--
How anyone will know this plan actually worked — the observable outcome, not
the test command. Task documents carry the step-by-step; this is the bar they
are graded against.

If part of it can't be verified (no deployment, no second machine, platform
won't deliver the signal), say so HERE rather than discovering it at the end.
That is what KnownGaps.md is for, and naming it early is what stops a phase
quietly grading itself on the half it could reach.
-->

## Result

<!--
Filled in as the plan lands — what shipped, what was found while building that
the plan didn't anticipate, and what it spawned into the registers.

The "what was found" part matters more than it looks. Every phase in this repo
so far has turned up at least one load-bearing thing that was invisible from
the plan's bullet list; writing those down is how the next plan gets written
less naively.
-->
