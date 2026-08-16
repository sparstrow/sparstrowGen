<!--
TEMPLATE — these four are ENTRIES APPENDED to existing files, not new files.
Copy the relevant block into the right register and delete the guidance.

Picking the right register is most of the work:

  | The situation                              | Register          | Id   |
  |--------------------------------------------|-------------------|------|
  | "I'm not answering that right now"         | OpenQuestions.md  | OQ-n |
  | "Let's do that later" (agreed, parked)     | Deferred.md       | D-n  |
  | "It's built, but I couldn't prove it"      | KnownGaps.md      | G-n  |
  | "It works, but only within these limits"   | KnownGaps.md      | G-n  |
  | "Might be nice one day" (merely noticed)   | Ideas.md          | I-n  |

Deferred vs Ideas: Deferred entries have a DECISION behind them and a trigger
for unparking. Ideas were merely noticed and may never be built.

KnownGaps vs bug/: a gap is a statement about the strength of the EVIDENCE
behind working code — not a claim that anything is broken. If something is
actually behaving wrong, it is a bug.

Use the next free number; ids are never reused, even after an entry is
deleted.
-->

---

# OQ-n — OpenQuestions.md

<!--
Format is mandated by AGENTS.md §8 and is not optional: context, a plain
user-side scenario, then options each carrying pros/cons, a score, blast
radius if chosen wrong, caveats, and a recommendation.

A question with no options is not ready to be asked. Presenting one is asking
the owner to do the analysis you were supposed to do.

An open question blocks ONLY the checklist item that depends on it — never the
whole task, never the plan. Mark that item `[~] blocked → OQ-n` and build
everything else.

WHEN ANSWERED: record the answer in the plan or task that consumes it, then
DELETE the entry from OpenQuestions.md. That file only ever holds what is
still open, so its length is a real signal.
-->

## OQ-n — <the question, as a noun phrase>

**Raised:** <YYYY-MM-DD>, <during what>.
**Blocks:** <the specific checklist item(s) — never "the task">

### Context

<!-- What makes this a real question. What is true today, and what forces a choice. -->

### Scenario

<!--
A plain, concrete situation in the owner's own terms — no jargon, no internals.
"An agent spends 40 minutes refactoring on your desktop, then the machine
reboots. What survives?" This is what makes the question answerable by someone
who has not read the code.
-->

### Options

**A — <name>**
- **Pros:** <what it buys>
- **Cons:** <what it costs>
- **Score: <n>/10**
- **Blast radius if wrong:** <what breaks, and whether it's recoverable>
- **Caveats:** <what must be true for this to work>

**B — <name>**
<!-- Same five fields. Two options minimum; three is usually the honest number. -->

### Recommendation

<!-- Which one, and why — scoped tightly. Say what you'd narrow or exclude. -->

---

# D-n — Deferred.md

<!--
Agreed in principle, explicitly parked. Every entry needs a TRIGGER for
unparking, so nothing sits here purely because it was forgotten.

"Unpark when" is the load-bearing line. "Later" is not a trigger; "when anyone
outside the Supabase org needs mail, or the app deploys publicly — whichever
comes first" is.

Write it in the same turn the owner says "park it" / "later" / "not now",
rather than relying on the conversation being re-read.
-->

## D-n — <what is being parked>

**Parked:** <YYYY-MM-DD>, by <the owner / during what> — "<their words, if they said it>"

<!--
What state this leaves things in, stated plainly. Distinguish "not built" from
"built but not switched on" — D-8's whole point is that the OAuth code is
complete and verified, and only configuration is missing.

Name what is genuinely lost by parking, in the reader's terms. The failure
mode this section prevents: someone later assumes the parked thing half-works.
-->

- **If wrong:** <what breaks, and who notices>
- **Unpark when:** <the concrete trigger — an event, a threshold, a person>

---

# G-n — KnownGaps.md

<!--
Built, but not fully proved — or proved to be limited. This is the register an
agent reads BEFORE trusting that something works, and before claiming it does.

Add it IN THE SAME CHANGE that creates it. If a checklist item was ticked on
weaker evidence than it asked for, say so in the task's Result AND open an
entry here. A caveat that lives only in a chat message does not exist.

WHEN YOU CLEAR ONE: delete the entry and say where the proof lives. The length
of this file is a real signal — a gap lingering because closing it was
inconvenient is the exact failure this register exists to prevent.
-->

## G-n — <what is unproved, as a claim>

**Raised:** <YYYY-MM-DD> (<task or phase that left it>).

<!--
What was verified, what was NOT, and why it ended up that way. Be precise about
the boundary — G-1's value is that it says the shared shutdown handler IS
exercised through the HTTP route, and only the signal wiring is untested.

"Why it ended up that way" matters: a platform that won't deliver the signal is
a different situation from nobody having got round to it, and the reader needs
to know which.
-->

- **If wrong:** <the cost if the assumption doesn't hold — be honest in both
  directions; "cosmetic and self-correcting" is a legitimate answer>
- **Clears when:** <the concrete thing that closes it — an action someone can
  take, not "when we have time">

---

# I-n — Ideas.md

<!--
Unscoped. No commitment, no decision, possibly never built. Distinct from
Deferred: those were agreed and parked, these were merely noticed.

Keep them short. An idea that needs three paragraphs has probably become a
plan — or at least a Deferred entry with a decision behind it.

If an idea graduates, it becomes a plan in doc/plans/ and the entry is deleted.
-->

## I-n — <the idea, in a few words>

<!--
What it is and why it might be worth doing. If it was rejected for now, say
what would make it interesting later — that sentence is what stops it being
re-proposed identically in three months.

End with where it came from, italicised, when the origin explains the shape:
*Surfaced while scoring Decision 2 Option C.*
-->
