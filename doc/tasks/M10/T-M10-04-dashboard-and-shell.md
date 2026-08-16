# T-M10-04 — Dashboard entry point, and the workspace name in the shell

| | |
|---|---|
| **Tag** | `[C]` — shares `nav-meta.ts` with T-M10-03; interleavable, one worker at a time |
| **Serves** | `US2` — a fresh account is met with direction, and naming a workspace has a visible effect |
| **Depends on** | T-M10-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> 1. **Given** I have just created an account, **When** I land in the app,
>    **Then** I am shown the setup steps and which one is next — **not an empty
>    dashboard**.
> 4. **Given** I am fully set up, **When** I look, **Then** the guide is not in
>    my way — it stands down rather than nagging.

Scenario 4's "stands down" is *this* task. `/setup` stays reachable forever; the
thing that goes away is this card.

## Objective

Put a compact setup card at the top of the web dashboard that shows progress
and links to `/setup`, and remove it once all three steps are done. Separately,
make `WorkspaceSwitcher` show the real workspace name, so M10's naming control
has a visible effect.

## Decisions already made

### The card goes in `apps/web/src/app/page.tsx`, not the shared dashboard

The web dashboard is its own ~200-line implementation, unlike every other route
which re-exports a `packages/ui` page. A card added to
`packages/ui/src/routes/pages/dashboard.tsx` would be shown to **nobody** on the
web. This is the phase's headline trap.

The card **component** still lives in `packages/ui/src/components/` so it is
tested and styled with everything else; only its placement is web-specific.

### What the card shows

One line of progress (`2 of 3 done`), the name of the current step, and a link
to `/setup`. Not the steps themselves — the page is one click away and a
three-step checklist duplicated on the dashboard is the nagging scenario 4 rules
out.

### It renders `null` when complete, and `null` when the queries failed

- All three `done` → nothing. `isSetupComplete()` decides.
- Any step `unknown` → nothing. A broken setup query is not something to debug
  on the dashboard, and a card reading "couldn't check your setup" above someone
  else's real work is noise. `/setup` is where the failure is shown, per the
  phase's four-states table.
- Loading → a skeleton of the same height as the card, so the dashboard does
  not jump.

### `WorkspaceSwitcher` shows the workspace name

Today it prints the literal `"Sparstrowgen"`
([`workspace-switcher.tsx:50`](../../../packages/ui/src/components/layout/workspace-switcher.tsx:50)).
It becomes the workspace's name when there is one, falling back to
`"Sparstrowgen"` when `useWorkspace()` has no data — which is the case in the
desktop build, where there is no cloud workspace at all. The dropdown label at
line 60 keeps showing the account name; the two lines answer different
questions.

**Rejected:** showing the slug, or the name plus the slug. The slug is an
internal identifier nothing resolves by ([M9 phase decision 2](../M9/README.md)),
and putting it in the shell would make it look load-bearing.

## Checklist

- [ ] `packages/ui/src/components/setup-card.tsx` created, consuming
      `setupSteps()` + `isSetupComplete()` with the same three hooks
      T-M10-03 uses
- [ ] Returns `null` when complete, `null` when any step is `unknown`, a
      same-height skeleton while loading
- [ ] Rendered at the **top** of `apps/web/src/app/page.tsx`, above
      `<AttentionQueue />`
- [ ] `WorkspaceSwitcher` shows the workspace name with the
      `"Sparstrowgen"` fallback; verified the desktop build still reads
      `"Sparstrowgen"` and does not flash or error
- [ ] The switcher's `title` attribute updated to match what it now shows
- [ ] `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` green
- [ ] Knowledge Center: `first-run-setup.md` now describes a real guide rather
      than a manual process — this is the article this phase most directly
      falsifies (AGENTS.md §3.2). Re-read `what-is-sparstrowgen.md` too

## Traps

**Adding the card to the shared dashboard shows it to nobody on the web.**
`apps/web/src/app/page.tsx` is the file. This is worth checking twice: the
shared `dashboard.tsx` exists, imports cleanly, and produces no error — it is
simply not what the web renders.

**`WorkspaceSwitcher` renders in the desktop build too**, where `useWorkspace`
will fail or return nothing. It must fall back silently, not render an error or
an empty string. The component's own doc comment explains the two-host
arrangement; read it before editing.

**A card that appears after three queries resolve shifts the whole dashboard.**
The skeleton is not decoration — without it the stat grid jumps on every load.

**Do not add a "dismiss" or "hide" control.** Phase decision 5 / plan decision
5. It needs stored state, and the card removes itself on completion anyway.

**`useWorkspace` does not poll.** After a rename, the sidebar updates because
`useRenameWorkspace` invalidates `["workspace"]`. If it does not update, the
fix is the invalidation, not a `refetchInterval`.

## Verification

- [ ] `pnpm typecheck`, `pnpm test` green; `pnpm --filter web build` succeeds
- [ ] Scenarios 1 and 4 walked in a browser, and the sidebar showing a renamed
      workspace — proved in [T-M10-05](T-M10-05-verification.md)
- [ ] The desktop build's sidebar still reads `"Sparstrowgen"` — checked there,
      not inferred from the fallback existing

## On completion

- [ ] Tick 12.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
