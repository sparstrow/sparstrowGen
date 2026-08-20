# T-M10-03 — The `/setup` page

| | |
|---|---|
| **Tag** | `[C]` — shares `nav-meta.ts` and route registration with T-M10-04; interleavable, one worker at a time on those files |
| **Serves** | `US2` — the guide itself |
| **Depends on** | T-M10-01, T-M10-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-20) |

## The scenarios this satisfies

> 1. Shown the setup steps and which one is next.
> 2. Returning later: completed steps done, pointed at the next one.
> 4. Fully set up: the guide is not in my way.
> 5. A step that cannot be completed yet says so and why.
> 6. I can skip ahead — the guide is a guide, not a gate.
> 7. Profile filled in **right there** — avatar, name, about you.
> 8. Workspace filled in right there — logo, name, description, context.
> 10. The machines step says plainly what connecting a machine requires today,
>     including the dev checkout.

## Objective

Build `packages/ui/src/routes/pages/setup.tsx` — three steps rendered from
`setupSteps()`, two of them completable inline, the third linking to
`/machines` — and register it as a web route.

## Decisions already made

### The page is web-only

Phase decision 2. `apps/web/src/app/setup/page.tsx` is created;
`packages/ui/src/router.tsx` is **not** touched. The local desktop build has no
account, no cloud workspace and no pairing, so a guide there would teach a
workflow that host does not have.

### The three steps and their copy

| Step | What it is for | Action |
|---|---|---|
| **Your profile** | "Agents work on your behalf — this is who they're working as, and what they should know about you." | `<ProfileForm variant="inline" />` |
| **Your workspace** | "Everything — machines, agents, runs, memory — lives inside a workspace. Name it, and tell agents what it's for." | `<WorkspaceForm variant="inline" />` |
| **Your first machine** | "Agents run on a computer you own, not in the browser. Pairing one is what makes everything else work." | a link to `/machines`, plus the honest requirement |

Wording is the implementer's to improve. Three claims are fixed: the machine
step must state that `sparstrow` is not published and needs a checkout of this
repository today (FR-016, spec decision 3); no step may promise anything the app
cannot deliver; and the first two steps must make clear that **only the name is
needed to move on** (FR-020), so nobody thinks an avatar is required.

### Step rendering by state

| State | Renders |
|---|---|
| `done` | collapsed: a check, the title, and what it resolved to (the name, or "1 machine paired"). Still expandable, and expanding it shows the same form so a value can be changed — a done step is not a locked one |
| `current` | expanded, with its action |
| `todo` | collapsed, muted, expandable. **Not disabled** — scenario 6 |
| `unknown` | expanded with "couldn't check this" and a retry that refetches that step's query only |

**`todo` steps are clickable.** That is the whole of scenario 6: someone who
wants to pair a machine before naming their workspace can. Disabling later
steps would turn the guide into the gate FR-012 forbids.

### When everything is done

The page stays reachable and says setup is complete, with links to the things
worth doing next (start a run, create an agent). It does **not** redirect and it
does **not** 404 — scenario 4 says "not in my way", and the thing that was in
the way was the dashboard card, which T-M10-04 removes on completion.

### No dismiss button

Phase decision 5. Dismissal needs stored state, which plan decision 5 rules
out, and the dashboard card disappearing on its own makes it unnecessary.

## Checklist

- [x] `packages/ui/src/routes/pages/setup.tsx` created, consuming
      `setupSteps()` with `useProfile()`, `useWorkspace()`, `useRuntimes()` —
      the profile **row**, not `useAccount()`; see T-M10-01
- [x] Query `isError` mapped to `null` and `isLoading` (latched — see below)
      left distinct, per T-M10-01's convention — do not collapse them
- [x] Four step renderings per the table; `todo` steps expandable, never
      disabled
- [x] Machine step states the dev-checkout requirement and links to
      `/machines`
- [x] Completed state: the page says so and offers what to do next
- [x] Loading: skeletons that keep the step list's shape, no reflow
- [x] `apps/web/src/app/setup/page.tsx` created — five-line re-export, matching
      [`imports/page.tsx`](../../../apps/web/src/app/imports/page.tsx)
- [x] `NAV_META.setup = { label: "Setup", icon: Compass }` in `nav-meta.ts` so
      the breadcrumb does not read a lowercase `setup`
- [x] **Not** added to the sidebar `NAV_GROUPS` — the dashboard card and the
      breadcrumb are the entry points; a permanent sidebar row for a page that
      stops being useful is clutter
- [x] `packages/ui/src/router.tsx` **not** touched (phase decision 2) —
      confirmed by `grep -n setup packages/ui/src/router.tsx`, zero matches
- [x] Shadcn workflow followed before writing the page (AGENTS.md §3.11)
- [x] `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` green

## Traps

**A `todo` step that is disabled fails scenario 6 silently.** It looks tidy and
it is the natural thing to build. Read FR-012 before styling the collapsed
state.

**The retry on an `unknown` step must refetch *that* query, not reload the
page.** A page reload also re-runs the two queries that succeeded, and on a
flaky connection turns one failed step into three.

**Registering `/setup` in `packages/ui/src/router.tsx` would put it in the
desktop build**, where `useAccount()` is `null` and two of three steps have
nothing to read. Phase decision 2 exists for this.

**`nav-meta.ts` is edited by T-M10-04 as well.** Coordinate — this task is
`[C]` for that reason.

**Do not make the guide a modal or a redirect target.** Plan decision 4. A
first-load redirect to `/setup` is the most tempting version of this feature
and it is a gate.

## Verification

- [x] `pnpm typecheck`, `pnpm test` green; `pnpm --filter web build` lists
      `/setup`
- [x] Scenarios 1, 2, 4, 5, 7, 8, 10 walked in a browser — see
      [T-M10-05](T-M10-05-verification.md) for the full account. Scenario 6
      (jump straight to the machine step from a fresh, all-`todo` account) was
      observed as render-correct (collapsed, muted, not disabled) but not
      literally clicked through in that exact order this pass
- [x] The desktop build does not gain a `/setup` route — confirmed by grepping
      `packages/ui/src/router.tsx`

## On completion

- [x] Tick 12.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table

## Result

`packages/ui/src/routes/pages/setup.tsx` — three `StepShell` rows, each
showing a state icon (done = `CheckCircle2`/success; current = a filled
brand-coloured dot; todo = an outlined dot; unknown = `CircleAlert`/warning),
collapsed by default except `current` and `unknown` (auto-expanded), toggled
by click with per-step manual overrides once a user has interacted. The
machine step's copy states the dev-checkout requirement in both its `todo`
and `current` renderings, never implying a published command. Completion
banner (`PartyPopper`, success-tinted) sits above the step list and the list
itself stays visible and accurate underneath — the page never redirects,
never 404s, and never gates.

**A real bug was found and fixed while proving the error state live**:
[`BUG-2026-08-20-setup-workspace-error-never-settles`](../../bug/BUG-2026-08-20-setup-workspace-error-never-settles.md).
The original `loading` gate (a live `isLoading` OR across three queries) let
the workspace step's own inline form — mounted only once loading resolves —
create a feedback loop with the very query it also observes, so a genuinely
failed `/workspace` request never surfaced its error UI; the page just sat on
skeletons forever. Fixed by latching `loading` to false permanently once every
query has settled once, rather than re-deriving it live on every render.
Re-verified after the fix: the error state renders correctly and its retry
button works. This is exactly the kind of defect `frontend-verify`'s
render-tier pass exists to catch and unit tests cannot — `setupSteps()`'s own
tests are pure-function and correctly assume delivery once, not toggling.

Rendered and confirmed, live, on a fresh disposable account
(`*@sparstrow.test`) against `staging.sparstrow.com`'s database via
`localhost:3000`: fresh-account empty state, profile completion (name alone),
workspace completion (name alone, slug derives and freezes), live machine
pairing from `/machines` flipping the third step with zero stored flag, full
completion banner, the forced-error state and its recovery, the dashboard
card's *absence* once complete (directly confirmed), light and dark themes,
and 375px with no sideways scroll. Full method, account details, and what
remains unproven — scenario 11, Mono surface, the desktop build, and the
dashboard card's own **populated** and **loading** states, which were never
actually visited mid-setup this pass — are in
[T-M10-05](T-M10-05-verification.md) rather than duplicated here.
