# AI slop skills — catalogue, report-only audit, and the conformance purge — 2026-08-19

| | |
|---|---|
| **Spec** | n/a (internal) — changes how the repo is built and governed, not what the owner sees |
| **Status** | ✅ Completed 2026-08-19 |
| **Trigger** | Owner review of the design skill chain: `design-system-conformance` forbade "AI-slop patterns" without naming any, and the owner asked for a real slop catalogue plus a generic auditing agent, with coding and database families to follow |
| **Depends on** | `DESIGN.md` (2026-08-18) and `design-system/`, both of which must exist for drift to be measurable |
| **Touches** | `.claude/skills/{ai-design-slop,slop-audit,frontend-wiring}/`, `.claude/agents/{slop-killer,frontend-builder}.md`, `AGENTS.md` §1 and §3.13 |
| **Tasks** | [D1](../tasks/D1/) — follow-on phase for the palette drift the first audit found |
| **Open questions** | OQ-3, blocking only two items in T-D1-01 |

## Summary

Replace an unenforceable self-graded checklist with a named catalogue, and put
the checking in a separate agent that cannot edit anything.

`design-system-conformance` was written before this repo had a real design
system. It was 85 lines an agent graded itself against, and its single sentence
about slop named zero patterns. Meanwhile `design-system/` became real — a token
mirror in `system.json`, six guideline cards, component cards — and `DESIGN.md`
§12 carries the project's own Do/Don't. The skill's remaining job was a prose
hop between two documents that already said it.

## The decision that shaped everything else

Every candidate rule sorts by one question: **would this still be slop in
someone else's app?**

| | Lives in |
|---|---|
| **Absolute tell** — gradient text, kicker above a heading, emoji-as-icon | `ai-design-slop/references/refuse-list.md` |
| **Relative drift** — untokenised values, icon set, contrast floors, surface treatments | `DESIGN.md` and `design-system/`; the catalogue only points |

This is not tidiness. `design-system/DECISIONS.md` records the defect that
followed from duplicating doctrine into a skill: the copy kept enforcing retired
rules for every agent that loaded it, and re-pointing the doctrine could not
reach it. Re-creating that was the main risk in this work, so the catalogue
deliberately contains no token name, no value, and no palette from this project.

## What was built

| Piece | Role |
|---|---|
| `.claude/skills/ai-design-slop/` | The `design` family catalogue: 38 absolute tells with a seven-field schema, three confidence tiers, plus `drift.md` (pointers only) and `NOTICE.md` (Apache-2.0 attribution) |
| `.claude/skills/slop-audit/` | Family-agnostic, report-only procedure: resolve family and target, static pass, optional render pass, triage, report |
| `.claude/agents/slop-killer.md` | Generic auditing agent declaring `Read, Grep, Glob, Bash` only. See the correction note below — the tool list is not self-enforcing |

Sources, both Apache-2.0: `impeccable` (rule schema, ~25 of its 32 slop rules,
the `craft-floor.md` refuse list, the tiering idea, the suppression ladder) and
Anthropic's `frontend-design` (three named default clusters). Neither was
adopted whole — each carries its own doctrine, which `DESIGN.md` §12 forbids
having a second copy of.

## What was removed or moved

| Change | Detail |
|---|---|
| Deleted `design-system-conformance` | Its job is now done by `DESIGN.md` + `design-system/` directly |
| Deleted the `ui-ux-designer` agent | The prose design spec was a hop between two documents that already carry the answer |
| Renamed `frontend-component-build` → `frontend-wiring` | The name implied it owned component design; it actually holds repo mechanics — paths, the router mock adapter footgun, contract wiring, the four states, Knowledge Center sync, verification |
| Rehomed four survivors into `frontend-wiring` | No-`DESIGN.md`-stop and four-states were already there; **doctrine-lacks → sign-off** and **focus-visible + named breakpoints** were added |
| Rewrote `frontend-builder` | Two skills (`frontend-wiring`, `ai-design-slop`), no subagent, no `Agent` tool, `nesting: leaf`. Definition of done gains: no `certain`-tier finding left standing |

## Correction — the tool list does not enforce report-only

This plan was written expecting `tools: Read, Grep, Glob, Bash` to make
report-only structural. It does not. On registering the agent the harness
returned its tool list with **`Write` and `Edit` appended**, despite the
definition omitting both.

So the boundary is a behavioural rule the agent keeps, reinforced in three
places (the agent body, `slop-audit`, and its Definition of done) rather than a
wall it sits behind. The enforceable part is the evidence:
**`git status --short` unchanged from before the run** — which is what the first
audit was actually checked against, and it passed.

## Why the auditor is a separate agent

An author auditing their own surface is not a second opinion — it is the same
judgment that wrote the code, checking its own work. `frontend-builder` loads
the catalogue to avoid introducing tells; `slop-killer` checks afterwards and
cannot fix what it finds. The split is the point.

## Adding a family later

Nothing in `slop-audit` or `slop-killer` names a design concept. A new family
supplies a catalogue with the same schema and tiers, and the only per-family
variation is which `detect` modes exist — `ai-coding-slop` and
`ai-database-slop` have no render pass, so that step is skipped and the report
says so.

## Verification

Markdown and agent definitions only; `pnpm typecheck` and `pnpm test` are
unaffected and prove nothing here. See the change's own report for what was
actually run.
