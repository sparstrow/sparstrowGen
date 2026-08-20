# T-M10-04 — Dashboard entry point, and the workspace name in the shell

| | |
|---|---|
| **Tag** | `[C]` — shares `nav-meta.ts` with T-M10-03; interleavable, one worker at a time |
| **Serves** | `US2` — a fresh account is met with direction, and naming a workspace has a visible effect |
| **Depends on** | T-M10-01 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-20) |

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
`"Sparstrowgen"` in **two** cases:

1. `useWorkspace()` has no data — the desktop build, where there is no cloud
   workspace at all.
2. `workspace.name` is `""` — a real workspace nobody has named yet, which after
   M9 is the state every fresh account starts in.

Case 2 is new and is the one that will be missed. Without it the sidebar renders
an empty string and the workspace line silently vanishes. `name || "Sparstrowgen"`
covers both, and the same expression is needed anywhere else a workspace name is
shown — grep for it.

The dropdown label at line 60 keeps showing the **account** name; the two lines
answer different questions. It needs the same treatment: `account.name` is now
`""` for a fresh account, so fall back to the email, which is always present and
is genuinely the person's identifier until they name themselves.

**Rejected:** showing the slug, or the name plus the slug. The slug is an
internal identifier nothing resolves by
([plan decision 8](../../plans/2026-08-16-setup-and-machines.md)), and putting it
in the shell would make it look load-bearing. **Also rejected:** falling back to
the email local part, which is the string spec decision 6 exists to get rid of.

### The avatar falls back to initials, and initials need a source

`WorkspaceSwitcher` renders `account.avatarUrl` with a `<Bot>` icon fallback
([`workspace-switcher.tsx:38-45`](../../../packages/ui/src/components/layout/workspace-switcher.tsx:38)).
That still works when the name is empty, because it never used the name. Leave
it alone — if `T-M9-04` shipped, an uploaded avatar flows through
`account.avatarUrl` from the session metadata with no change here.

## Checklist

- [x] `packages/ui/src/components/setup-card.tsx` created, consuming
      `setupSteps()` + `isSetupComplete()` with the same three hooks
      T-M10-03 uses (`useProfile`, `useWorkspace`, `useRuntimes`)
- [x] Returns `null` when complete, `null` when any step is `unknown`, a
      same-height skeleton while loading
- [x] Rendered at the **top** of `apps/web/src/app/page.tsx`, above
      `<AttentionQueue />`
- [x] `WorkspaceSwitcher` shows the workspace name, falling back to
      `"Sparstrowgen"` for **both** no-data and empty-name; the desktop build's
      own render was not launched this pass (no Electron/vite build run) —
      correctness argued from `useWorkspace(Boolean(account))` gating the
      fetch, not observed
- [x] The dropdown label falls back to the email when `account.name` is empty —
      **not** to the email local part — and this uncovered a real second bug:
      see the Result
- [x] `grep -rn "workspace.name\|account\.name" packages/ui/src apps/web/src` —
      every display site has an empty fallback (both are in
      `workspace-switcher.tsx`, the only two)
- [x] The switcher's `title` attribute updated to match what it now shows
- [x] `pnpm typecheck`, `pnpm test`, `pnpm --filter web build` green
- [x] Knowledge Center: `first-run-setup.md` and `what-is-sparstrowgen.md`
      both updated to describe the real `/setup` guide (done alongside
      `T-M9-04`'s wrap-up, re-checked here now the page actually exists)

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

- [x] `pnpm typecheck`, `pnpm test` green; `pnpm --filter web build` succeeds
- [x] Scenarios 1 and 4 walked in a browser, and the sidebar showing a renamed
      workspace — proved in [T-M10-05](T-M10-05-verification.md)
- [ ] The desktop build's sidebar still reads `"Sparstrowgen"` — **not
      checked**; no Electron/vite build was launched this pass. `KnownGaps.md`
      entry opened

## On completion

- [x] Tick 12.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table

## Result

`packages/ui/src/components/setup-card.tsx` — a compact `N of 3 done` card
with the current step named and a link to `/setup`; returns `null` for
complete or any-`unknown` per the phase decision, and a same-height skeleton
while loading. Wired into `apps/web/src/app/page.tsx` above `<AttentionQueue />`.

**`WorkspaceSwitcher`** now shows `workspace.data?.name || "Sparstrowgen"` for
the bold sidebar line, and `account.name || account.email` for the dropdown
label — `useWorkspace(Boolean(account))` gates the fetch so the desktop build
(no account) never issues a doomed request on every render, which required
adding an `enabled` parameter to `useWorkspace()` in `hooks.ts` (defaults to
`true`, so every other call site is unaffected).

**Fixing the dropdown-label fallback surfaced a second real bug**, not a
hypothetical the checklist merely anticipated:
[`BUG-2026-08-18-shell-invents-name-from-email`](../../bug/BUG-2026-08-18-shell-invents-name-from-email.md),
filed during M9, predicted that `account.name` would never actually be empty
once `T-M9-01`'s SQL landed, because `toSnapshot()`
(`apps/web/src/lib/auth/account-snapshot.ts`) fell back to
`email.split("@")[0]` — the same FR-019 invention M9 removed from the
database, in a second store. Fixed here: the fallback is gone, and the
`||`-chain naturally collapses both an absent key and an explicit `""` to
`""` once that third link is removed (two defects, one fix — see the bug
file's Investigation for why). Five new tests:
`apps/web/src/lib/auth/account-snapshot.test.ts`.

**Live-verified**: after naming the workspace "Sparstrow Inc" from inside the
guide, the sidebar's bold line updated to "Sparstrow Inc" **without a reload**
— confirmed both immediately and after a full page reload. Before naming, it
correctly showed "Sparstrowgen" (workspace name still `""`). The dashboard
card's absence once setup is complete was directly confirmed; its presence
*during* setup (the `N of 3 done` populated state) and its loading skeleton
were **not** actually visited this pass — the dashboard was only opened after
finishing all three steps. Recorded in `KnownGaps.md` rather than assumed from
the code.
