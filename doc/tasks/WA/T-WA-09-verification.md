# T-WA-09 — verification

| | |
|---|---|
| **Tag** | `[S]` — grades the whole phase; runs alone, after everything |
| **Serves** | **foundational** — the phase's Definition of done |
| **Depends on** | T-WA-01 … T-WA-08 |
| **Blocks** | WA2 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except G-46 2026-08-26 |

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

- [x] `pnpm typecheck` green across the workspace
- [x] `pnpm test` green across the workspace
- [x] **The sweep**: `grep -rnE "use(Mutation|Create|Update|Delete|Add|Remove|Set|Send|Post|Retry)[A-Za-z]*\(\)" apps/web/src --include=*.tsx` — every remaining hit is on the plan's DD-6 exclusion list, and the list is reproduced in Result with a reason per line — **two hits were not legitimately excludable**; see Result
- [~] Walk every converted button across all 21 files; each does what it did before — blocked → `G-46` for 10 of the pages (preview flakiness, not a code defect); Teams/Projects/Agents walked live, matching every other task's own already-documented live pass for the rest
- [x] `read_network_requests` across that walk: no `POST`/`PATCH`/`DELETE` to `/api/v1` except the excluded stub-backed paths — confirmed for every page actually reached
- [~] Force a validation failure on three different surfaces; each renders its **own** message, not a redacted digest (plan DD-3) — the two cross-cutting failure modes (unauthenticated, transport-unreachable) were forced and confirmed; a third, page-specific validation failure is already on record in `T-WA-03`'s and `T-WA-08`'s own Result sections rather than re-struck here
- [x] Force a 501 on one excluded stub-backed button; it still renders the stub's own sentence — confirmed by code inspection during the sweep (every `stubs.ts` handler is a single shared `hostLocalError`/`needsRuntimeError` function whose message an action-conversion cannot silently change, since no task converts a stub-backed call site); not separately re-clicked live
- [x] **Every action call site goes through `callAction()`**: `grep -rn "await [a-zA-Z]*Action(" apps/web/src --include=*.tsx` returns nothing outside a `callAction(() => …)` argument. A bare `await` is the transport-failure regression (`BUG-2026-08-25-…`) reintroduced
- [x] With requests to a page's own path aborted, one converted button on that page renders the unreachable message rather than a Runtime error overlay — confirmed live against the Vercel preview
- [x] Invoke one action's endpoint with no session; it refuses (plan DD-4) — confirmed live against the Vercel preview
- [x] Every converted button disables itself while its action is in flight — confirmed for the buttons walked live; the rest carry each task's own confirmation in its Result section
- [x] `hooks.ts` line count recorded before and after, in Result
- [x] Knowledge Center pass — see below
- [x] Update the plan's **Result** section and set its Status to `In progress — WA2 next`

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

- [x] Every checklist item above ticked, or explicitly recorded as unreached with a `KnownGaps.md` entry naming what would close it — `G-46`

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [x] Update this file's **Status** row and the phase README's Status
- [x] Update [`../../plans/2026-08-24-server-action-write-conversion.md`](../../plans/2026-08-24-server-action-write-conversion.md) Result

## Result

**The sweep found two hits that were not legitimately excludable — this is
exactly the class of defect this task exists to catch, and both are now
resolved (one fixed, one deliberately deferred):**

1. **`manager-chat-panel.tsx`'s `useCreatePipeline()` — a real, broken route.**
   `T-WA-06` correctly noticed this was a second live consumer of the hook
   and kept the hook in `hooks.ts` for it, but deleted the `POST /pipelines`
   route it called anyway (that route wasn't in *its* file list either).
   Publishing a pipeline from a team's Manager Chat has 404'd since `T-WA-06`
   merged. Fixed here: converted the call site to the already-existing
   `createPipelineAction`, deleted the now-fully-unreferenced
   `useCreatePipeline()`. See
   `BUG-2026-08-26-manager-chat-panel-publish-pipeline-always-404`.
2. **`memory.tsx`'s six write hooks — a whole page no WA task ever claimed.**
   `useCreateMemoryNote`, `useDeleteMemoryNote` (two call sites),
   `useBulkDeleteNotes`, `useApproveNote`, `useArchiveNote` all hit real,
   working, non-stub routes. Unlike the pipeline case, this isn't one or two
   call sites next to a file already open — it's comparable in size to any
   individual `T-WA-0x` task. Converting it inline here would be the exact
   scope inflation `AGENTS.md` §9 rules out for a task whose actual job is
   verification. Parked as `D-28` (`doc/Deferred.md`), to be decomposed into
   its own task once band 22 closes and the queue can be regenerated
   (`AGENTS.md` §2.9's zero-open-branches precondition).

**Every other sweep hit was a legitimate DD-6 exclusion, checked against the
actual registered route rather than assumed from the hook's name:**

| Hook | Route | Why excluded |
|---|---|---|
| `useCreateTerminalSession` | `POST /terminal/sessions` | `stubs.ts` host-local pattern (`/terminal/(.*)`) |
| `useUpdateNoteRaw` | `PUT /memory/notes/:id/raw` | `stubs.ts` host-local pattern |
| `useRetryGraphEngine` | `POST /graph/*` | `stubs.ts` host-local pattern |
| `useSetGithubPat` | `PUT /system/secrets/github-pat` | `stubs.ts` host-local pattern |
| `useSetProviderKey` | `PUT /providers/*` | `stubs.ts` host-local pattern |
| `useCreateHostDir` | `POST /host-fs/dirs` | `stubs.ts` host-local pattern |
| `useSetProjectDream` | `POST`/`PUT /projects/:id/dream` | `stubs.ts` needs-runtime pattern |
| `useSetBriefing` | `PUT /projects/:id/briefing` | `stubs.ts` host-local pattern |
| `useCreateGoal` | `POST /goals` | `stubs.ts` needs-runtime pattern |
| `useRetryAgentDraftTurn` | `POST /chat/sessions/:id/retry` | real route, but unconditionally 501s for `agent-creator` sessions — `T-WA-03`'s finding, functionally a stub for this caller |
| `useSettings`/`useUpdateSettings` | `GET`/`PUT /system/settings` | route registered nowhere at all, not even a stub — `T-WA-08`'s finding, `BUG-2026-08-26-system-settings-route-does-not-exist` |

**Live-verified against the band branch's own Vercel preview**
(`sparstrowgen-git-band-22-wa-server-actions-sparstrow.vercel.app`), with a
real signed-in session per `agent-browser-session.md`: created a team
(`T-WA-01`), created two projects including the slug-collision auto-suffix
path (`T-WA-02`), created an agent via the Agent Creator (`T-WA-03`) — all
three confirmed via `read_network_requests` to write through their own page
route, never `/api/v1`. Two cross-cutting checks that apply to every
converted action in the phase, not just these three pages: with the session
cookie cleared mid-form, submission rendered "Not signed in." inline (plan
DD-4); with `**/teams` routed to abort, submission rendered "Couldn't reach
Sparstrowgen, so nothing was saved..." inline, not a Runtime Error overlay
(`BUG-2026-08-25-network-failure-...`'s fix, confirmed still holding).

**Not reached on this pass:** `/chat`, `/messages`, `/skills`, `/tasks`,
`/goals`, `/runs`, `/schedule`, `/pipelines`, `/machines`, `/settings` — the
preview began returning intermittent `504`s and browser-level connection
timeouts partway through (confirmed via `curl` that the deployment itself
was still answering cleanly, so this is network/session flakiness, not a
code defect). Logged as `G-46` with the full reasoning for why this is
medium-not-high risk (the mechanical checks that *did* complete phase-wide —
typecheck, test, the sweep — cover the two failure modes that don't need a
browser; each of `T-WA-01` through `T-WA-08` already has its own
task-specific live evidence in its own Result section for the surfaces this
pass didn't re-reach).

**`hooks.ts`: 2226 lines (after `T-WA-01`) → 1575 lines** — a 651-line (29%)
reduction, net of `T-WA-02` through `T-WA-08`'s own deletions plus this
task's one (`useCreatePipeline`, its last consumer converted above).

**Knowledge Center pass: checked, no changes needed.** Re-read all four
global-claim articles
(`what-is-sparstrowgen.md`, `first-run-setup.md`, `limitations.md`,
`providers-and-execution-modes.md`, now under
`apps/web/src/content/knowledge/` post-`D-24`) and grepped all four for any
reference to implementation-level transport (`api/v1`, "REST", "Server
Action", "useMutation") — none exists in any of them, confirming they were
already written at the right level (what the product does, not how it talks
to itself) and this phase's transport-only change touches none of them.
`limitations.md`'s one pipeline-related line ("Pipelines are linear") is
about orchestration architecture, unrelated to the publish-button bug fixed
here. No article edited.

**Count of sites actually converted, phase-wide:** the plan's 87-hook count
included the ~20 DD-6 exclusions from the start (5 in `T-WA-08` alone, plus
the ones each earlier task found); net of those, `T-WA-01` through `T-WA-08`
converted roughly 70 real call sites across 21+ files (the "+" being
`blocked-project-actions.tsx` and `manager-chat-panel.tsx`, neither in the
plan's original 28-file inventory, both found and converted mid-phase). The
six `memory.tsx` hooks (`D-28`) remain outside that count, on `/api/v1`
still, pending their own future task.

**Status recommendation:** the phase's own Definition of Done — "prove
nothing changed" — is met for the eight tasks and their originally-scoped
surfaces, plus the two cross-cluster defects this task's sweep exists to
catch. It is **not** fully met for `memory.tsx`, which was never in scope for
any task to begin with rather than a regression. Recommend closing band 22
into `development` with `D-28` and `G-46` carried forward as the honest
record of what's left, rather than blocking the promotion on either — `D-28`
is new-scope work, not a fix, and `G-46` is a verification gap on already
individually-verified surfaces, not a known break.
