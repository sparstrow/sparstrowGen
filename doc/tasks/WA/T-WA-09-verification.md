# T-WA-09 — verification

| | |
|---|---|
| **Tag** | `[S]` — grades the whole phase; runs alone, after everything |
| **Serves** | **foundational** — the phase's Definition of done |
| **Depends on** | T-WA-01 … T-WA-08 |
| **Blocks** | WA2 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove that **nothing changed**. This phase produces no new capability, so its
verification is the harder kind: a walk of every converted button confirming it
does exactly what it did before, plus evidence that the transport actually
moved.

## Why this task exists as its own `[S]` step

Each sibling task verified its own cluster. That is necessary and not
sufficient, for a reason this repo has already been bitten by twice:

- **`T-VR-06`** ran the first full-branch rendered pass and found
  `BUG-2026-08-24-project-provision-always-400s` — a pre-existing, unrelated
  break that every per-task check had walked past.
- **`T-M13-05`** found that `GET /chat/sessions/:id`'s shape did not match what
  the page read, making the whole cloud chat UI non-functional, *after* four
  tasks had each verified their own piece and 1000+ tests were green.

Cross-cluster breakage is exactly what this phase can produce: `useCreateRun`
and the two chat-session hooks each have consumers in two different tasks, and
whichever landed second was the one deleting a hook the other still needed.

## Method

Per `AGENTS.md` §3.10 and the `frontend-verify` skill, against **the feature
branch's own Vercel preview** with a real signed-in session — not localhost, and
not `development.sparstrow.com`. Session obtained per
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md).

Browser driven with the `agent-browser` CLI, per the same runbook's 2026-08-24
revision.

## Checklist

- [ ] `pnpm typecheck` green across the workspace
- [ ] `pnpm test` green across the workspace
- [ ] **The sweep**: `grep -rnE "use(Mutation|Create|Update|Delete|Add|Remove|Set|Send|Post|Retry)[A-Za-z]*\(\)" apps/web/src --include=*.tsx` — every remaining hit is on the plan's DD-6 exclusion list, and the list is reproduced in Result with a reason per line
- [ ] Walk every converted button across all 21 files; each does what it did before
- [ ] `read_network_requests` across that walk: no `POST`/`PATCH`/`DELETE` to `/api/v1` except the excluded stub-backed paths
- [ ] Force a validation failure on three different surfaces; each renders its **own** message, not a redacted digest (plan DD-3)
- [ ] Force a 501 on one excluded stub-backed button; it still renders the stub's own sentence
- [ ] **Every action call site goes through `callAction()`**: `grep -rn "await [a-zA-Z]*Action(" apps/web/src --include=*.tsx` returns nothing outside a `callAction(() => …)` argument. A bare `await` is the transport-failure regression (`BUG-2026-08-25-…`) reintroduced
- [ ] With requests to a page's own path aborted, one converted button on that page renders the unreachable message rather than a Runtime error overlay
- [ ] Invoke one action's endpoint with no session; it refuses (plan DD-4)
- [ ] Every converted button disables itself while its action is in flight
- [ ] `hooks.ts` line count recorded before and after, in Result
- [ ] Knowledge Center pass — see below
- [ ] Update the plan's **Result** section and set its Status to `In progress — WA2 next`

## The Knowledge Center pass

`AGENTS.md` §3.2 requires it, and the honest answer here is likely **"no article
changes"** — this phase changes no user-visible behaviour, which is its whole
point. That answer still has to be *reached* rather than assumed:

- Re-read the four global-claim pages (`what-is-sparstrowgen.md`,
  `first-run-setup.md`, `limitations.md`, `providers-and-execution-modes.md`).
  None should need a word.
- **If any article changed, this phase broke its own rule.** A Knowledge Center
  edit is evidence of a behaviour change, and a behaviour change is a defect
  per the plan's Scope boundaries. Investigate rather than edit.

State the outcome explicitly in Result. "Checked, no changes needed, here is
why" is a real result; silence is indistinguishable from not having looked.

## Traps

**A green typecheck proves almost nothing here.** Every failure mode this phase
can produce — a lost error message, a lost pending state, a lost optimistic
append, a `File` that does not survive serialization, a `revalidatePath`
pointing at the wrong route — typechecks perfectly. This is why the method is a
rendered walk and not a test run.

**"It still works" is not a result.** Name what was clicked and what was
observed, per the task template. `T-M8-05`'s Result is the standard: four
defects that 1044 passing tests could not catch.

**If the preview pass cannot be completed**, tick nothing on its behalf. Say
what was actually run and open a [`KnownGaps.md`](../../KnownGaps.md) entry in
this same change — the same constraint `G-22` and `G-31` record. Shipping
without proof is allowed; shipping without saying so is not.

## Verification

- [ ] Every checklist item above ticked, or explicitly recorded as unreached with a `KnownGaps.md` entry naming what would close it

## On completion

- [ ] Tick 22.9 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md), and mark band 22 complete
- [ ] Update this file's **Status** row and the phase README's Status
- [ ] Update [`../../plans/2026-08-24-server-action-write-conversion.md`](../../plans/2026-08-24-server-action-write-conversion.md) Result

## Result

*Filled in when the task lands. Name the count of sites actually converted —
the plan's 87 counts every call site including the ~20 the DD-6 exclusions
remove, so the real number will be lower and should be stated rather than left
to be inferred.*
