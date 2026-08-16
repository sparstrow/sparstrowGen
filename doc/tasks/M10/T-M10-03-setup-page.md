# T-M10-03 — The `/setup` page

| | |
|---|---|
| **Tag** | `[C]` — shares `nav-meta.ts` and route registration with T-M10-04; interleavable, one worker at a time on those files |
| **Serves** | `US2` — the guide itself |
| **Depends on** | T-M10-01, T-M10-02 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `packages/ui/src/routes/pages/setup.tsx` created, consuming
      `setupSteps()` with `useProfile()`, `useWorkspace()`, `useRuntimes()` —
      the profile **row**, not `useAccount()`; see T-M10-01
- [ ] Query `isError` mapped to `null` and `isLoading` left as `undefined`,
      per T-M10-01's convention — do not collapse them
- [ ] Four step renderings per the table; `todo` steps expandable, never
      disabled
- [ ] Machine step states the dev-checkout requirement and links to
      `/machines`
- [ ] Completed state: the page says so and offers what to do next
- [ ] Loading: skeletons that keep the step list's shape, no reflow
- [ ] `apps/web/src/app/setup/page.tsx` created — five-line re-export, matching
      [`imports/page.tsx`](../../../apps/web/src/app/imports/page.tsx)
- [ ] `NAV_META.setup = { label: "Setup", icon: … }` in `nav-meta.ts` so the
      breadcrumb does not read a lowercase `setup`
- [ ] **Not** added to the sidebar `NAV_GROUPS` — the dashboard card and the
      breadcrumb are the entry points; a permanent sidebar row for a page that
      stops being useful is clutter
- [ ] `packages/ui/src/router.tsx` **not** touched (phase decision 2)
- [ ] Shadcn workflow followed before writing the page (AGENTS.md §3.11)
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` green

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

- [ ] `pnpm typecheck`, `pnpm test` green; `pnpm --filter web build` lists
      `/setup`
- [ ] Scenarios 1, 2, 4, 5, 6, 7, 8, 10 walked in a browser — proved in
      [T-M10-05](T-M10-05-verification.md), not here
- [ ] The desktop build does not gain a `/setup` route — confirmed by grepping
      `packages/ui/src/router.tsx`

## On completion

- [ ] Tick 12.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
