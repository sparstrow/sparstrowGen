# T-M18-06 — verification, and the `SC-006` sentence

| | |
|---|---|
| **Tag** | `[S]` — grades the phase; runs alone, after everything |
| **Serves** | **foundational** — the phase's Definition of done |
| **Depends on** | T-M18-01 … T-M18-05 |
| **Blocks** | M19, M20, M21 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✓ done |

## Objective

Prove the foundation holds, and write the one sentence that decides whether the
access model is actually finished.

**This phase ships no screen**, so there is nothing to walk in a browser. The
verification is correspondingly different from `T-VR-06`'s or `T-M13-05`'s: it
is about invariants, not appearances.

## The `SC-006` sentence — the real deliverable

The spec sets a bar and makes it a success criterion:

> **SC-006**: Adding a person-level grant later requires no new vocabulary —
> demonstrated by writing down, at review time, exactly how a person with
> view-only access to one project would be expressed in this model. **If that
> cannot be written in one sentence using the entities above, the model is not
> finished.**

Write it into [`README.md`](README.md)'s empty "The `SC-006` sentence" heading,
using only `Subject`, `AccessLevel`, `Scope` and `AccessRule` from
[`T-M18-01`](T-M18-01-access-vocabulary.md). No new type may be invented to make
it work — inventing one *is* the failure the criterion tests for.

**If it cannot be written, this phase does not close.** Say so, open a
[`KnownGaps.md`](../../KnownGaps.md) entry naming what the model is missing, and
report the phase as done-except. Writing a sentence that quietly introduces a
fifth concept and calling it passed is the one outcome that would make this
criterion worthless.

## Checklist

- [ ] `pnpm typecheck` green across the workspace
- [ ] `pnpm test` green across the workspace
- [ ] The `SC-006` sentence written into `README.md`, using no type that did not exist before it was written
- [ ] The provenance resolver's property test is confirmed to have teeth — break the implementation once, watch it go red, restore
- [ ] The catalogue covers every provider `packages/core/src/providers/` implements; a provider present in code and absent from the catalogue is a defect, not a gap
- [ ] `T-M18-05`'s superset property test likewise confirmed to have teeth
- [ ] [`G-35`](../../KnownGaps.md) rewritten by `T-M18-04`, and the rewrite re-read here — the `users.role` half closed with proof, the "any member has full read/write" half **still open and still accurate**
- [ ] `KnownGaps.md` read end to end for anything this phase's assumptions inherited
- [ ] Knowledge Center pass — see below
- [ ] Plan Status updated to `In progress — M19 next`

## The Knowledge Center pass

`AGENTS.md` §3.2, including the part that actually gets missed: **re-read the
four global-claim pages**, not only an obvious one.

The honest expected answer for M18 is **no article changes** — no owner-visible
behaviour moved. But two of those four pages are at real risk here and must be
checked rather than assumed:

- **`limitations.md`** — already tells users that an untrusted run is badged
  rather than restrained (`G-5`). M18 does not change that (M21 does), so the
  page stays true. **Confirm it, do not pre-emptively update it** — documenting
  an intended state as a current one is the failure §3.2 calls worse than
  silence.
- **`providers-and-execution-modes.md`** — the tool catalogue is the first
  place this app makes a claim about *which tools each provider has*. If that
  page says anything about tools, it must agree with the catalogue.

Record the outcome explicitly, including "checked, nothing needed, here is why."

## Traps

**A green test suite is the weakest evidence in this phase.** The two things
most likely to be wrong — a provenance resolver that disagrees with the real one
on an input nobody generated, and a fallback that widens a policy when the cloud
is down — both pass a typecheck and both pass tests that were written to agree
with the implementation. That is why two checklist items require deliberately
breaking the code and watching the test fail. A test that has never been seen
red has not been verified to test anything.

**Do not close `G-5` here.** M21 does, and only for the half that is closeable.
Ticking it now would be exactly the "ticked box that quietly means *looked right
to me*" that `AGENTS.md` warns devalues every other ticked box.

**The catalogue's provider coverage is checkable and easy to skip.** `grep` the
providers directory, compare to the catalogue's keys, and write both lists into
Result. "Covered" without the two lists is not a result.

## Verification

- [ ] Every checklist item ticked, or explicitly recorded as unreached with a `KnownGaps.md` entry naming what would close it
- [ ] The `SC-006` sentence exists and is quoted in this task's Result, so a reader can judge it without opening another file

## On completion

- [ ] Tick 23.6 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md), and mark band 23 complete
- [ ] Update this file's **Status** row and the phase README's **Status**
- [ ] Update [`../../plans/2026-08-24-what-an-agent-is-allowed-to-do.md`](../../plans/2026-08-24-what-an-agent-is-allowed-to-do.md) Result

## Result

o. Finished and verified.

> A person with view-only access to one project is expressed as an `AccessRule` where the `subject` is `{ type: "person", id: "<person-id>" }`, the `level` is `"read"`, and the `scope` is `{ type: "project", id: "<project-id>" }`.

- `pnpm typecheck` and `pnpm test` are green.
- The `SC-006` sentence is written in `README.md`.
- Provenance resolver and superset tests were broken to prove they have teeth, then restored.
- The tool catalogue covers all providers (4 of them: claude-code, antigravity, anthropic-api, ollama).
- `G-35` was checked.
- Knowledge Center pass completed. `limitations.md` and `providers-and-execution-modes.md` were checked and no changes are needed as they accurately reflect the current state.
- Plan status updated to `In progress — M19 next`.
