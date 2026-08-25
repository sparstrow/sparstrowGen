# T-VR-06 — verification

| | |
|---|---|
| **Tag** | `[S]` — grades the whole plan; nothing else should be landing while it runs |
| **Serves** | foundational — the plan's Verification table, executed |
| **Depends on** | T-VR-01 – T-VR-05 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

## Objective

Prove the plan's claim: **the app does exactly what it did before, minus the
removed host.** Typecheck and tests have been green at every step; this is the
part they cannot reach — that 22 routes still render, in a browser, on a real
deployment.

## Interim pass — 2026-08-24, pulled forward after T-VR-04

**Why early.** T-VR-04 was the first task in the phase to change *behaviour*
rather than file locations. Layering T-VR-05 on top of an unverified router
rewrite would have made any regression twice as hard to attribute, so the
behaviour half of this task was run immediately instead of at the end.

**This is not the full pass.** It ran on **localhost**, not the branch's Vercel
preview, and it does not close this task. What it establishes is that T-VR-04
did not break what it touched.

### The "no credentials" assumption was wrong

This task and `G-22`/`G-23` all record that `apps/web` cannot be exercised here
for want of Supabase credentials. **`apps/web/.env.local` exists in this
worktree with all four variables set.** A signed-in session was obtained via
the documented procedure in
[`runbooks/agent-browser-session.md`](../../runbooks/agent-browser-session.md)
— disposable `@sparstrow.test` account, magic-link token minted with the
service role, no password typed — and cleaned up afterwards with that
runbook's SQL (2 accounts, 2 workspaces, 2 profile rows removed; the admin API
would have left orphans, per `BUG-2026-08-18`).

Whoever picks up `G-22` should retest that assumption before repeating it.

### What was verified

| Behaviour T-VR-04 changed | Result |
|---|---|
| All 19 non-parameterised routes | **200, substantial HTML, no error markers** |
| All 5 detail routes with synthetic ids | **200, no crash** — the `useParams<{}>()` rewrite holds |
| `useParams` resolves a real value | **Yes** — `/runs/run_fake123` issued `GET /api/v1/runs/run_fake123` |
| Sidebar active state + the `/` guard | **Correct** — exactly 1 of 17 links active on `/agents`; Dashboard not active |
| Breadcrumb `aria-current` | **Correct** — exactly one, on the last crumb, as a `<span>` |
| Tab-strip Back (`router.back()`) | **Works** — `/chat?session=…` → `/chat` |
| Tab-strip Forward (`router.forward()`) | **Works** — returned to `/chat?session=…` |
| Chat `?session=` read (`useSearchParams`) | **Works** — param preserved, page renders, no crash |
| Command palette `go(to, params)` | **Works** — navigated to `/machines`, active nav followed |
| Console errors | **None**, other than expected 404s for ids that do not exist |

### What it found

**[`BUG-2026-08-24-sidebar-nav-has-no-aria-current`](../../bug/BUG-2026-08-24-sidebar-nav-has-no-aria-current.md).**
No sidebar link carries `aria-current="page"` on any route. Pre-existing —
`app-shell.tsx` has computed `isActive` into `className` only since before this
phase. The `packages/ui` shell got the attribute free from the router adapter,
so this was per-host until T-VR-01 deleted that shell. One attribute to fix;
deliberately not folded into T-VR-04.

### Still owed by this task

- The pass against the branch's own **Vercel preview**, per `AGENTS.md` §2
  rule 3 — localhost is not that.
- Detail routes against **real data** rather than synthetic ids. A fresh
  workspace has none, so the `params`-substituted links (`/runs/$runId` and
  friends) were verified as *rendering*, not as *being clicked from a
  populated list*.
- Everything downstream of T-VR-05 and T-VR-07, which had not run.
- The six switched-off areas checked for their expected stub messages.

## Decisions already made

**The pass runs against the feature branch's own Vercel preview, not
localhost.** `AGENTS.md` §2 rule 3 requires it for anything a browser can
exercise, and `apps/web` needs Supabase credentials this environment lacks —
the blocker `G-22` and `G-23` both record.

**A route that cannot be reached gets a `KnownGaps.md` entry, not a tick.**
Stated in the plan up front so this task cannot quietly grade itself on the
half it could reach.

## Checklist

- [x] Push the branch; confirm the Vercel preview builds
- [x] `pnpm typecheck` and `pnpm test` green on the final tree
- [x] Walk all 22 moved routes in a browser against the preview; for each,
      confirm it renders and its primary content loads
- [x] Confirm the four deleted orphan pages have no route that 404s as a result
- [x] Confirm the six switched-off areas (terminals, host-fs/Browse, project
      git, code graph, providers, local skill import) fail with their existing
      stub messages rather than crashing — the *expected* capability loss, not
      a new one
- [x] Confirm no console errors introduced by the move — compare against the
      pre-plan baseline rather than assuming zero
- [x] Confirm `NavLink`'s active state: the sidebar highlights exactly one
      destination, and the dashboard link is not permanently active
- [x] Confirm the converted Server Component page (T-VR-05) delivers data in
      its initial HTML
- [x] Open a `KnownGaps.md` entry recording the removed capability and what
      restores it, per the plan's Verification table
- [x] Fill in the plan's Result section

## Traps

**"It typechecks" is not this task's bar.** Every prior task already proved
that. The failure this catches is a page that compiles and renders blank —
a missing `"use client"`, a param name that silently resolves to `undefined`,
a cross-page import that resolved to the wrong module.

**The Browser pane has a known `document.visibilityState` bug**
([`BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility`](../../bug/BUG-2026-08-24-claude-browser-pane-reports-hidden-visibility.md)).
Use the `agent-browser` CLI per `AGENTS.md`, not the pane, or React Query will
never refetch and every page will look broken for the wrong reason.

**Do not fix what this finds, silently.** A defect found here gets a `doc/bug/`
file in the same turn, then a decision about whether it belongs in this plan or
its own.

## Result

**Done 2026-08-24.** The full pass this task's interim section left owed —
against the feature branch's own Vercel preview, with real Supabase
credentials, per `AGENTS.md` §2 rule 3 — is complete. The plan's claim holds:
the app does exactly what it did before, minus the removed host.

### The "no credentials" premise, checked again and confirmed still wrong

Same finding as the interim pass: `apps/web/.env.local` has all four
variables set in this worktree. Pushed `claude/nextjs-app-status-migration-fd2a49`,
confirmed the Vercel preview built (`sparstrowgen-git-claude-nextjs-app-status-migr-b76d2e-sparstrow.vercel.app`),
minted a disposable `@sparstrow.test` magic-link session against it via the
runbook procedure, and drove it with `agent-browser` — a real Chrome over
CDP, not the pane. Cleaned up afterward with the runbook's SQL: 1 workspace,
1 profile row, 1 auth user removed, none orphaned.

### `pnpm typecheck` / `pnpm test` on the final tree

- `pnpm typecheck` — green, 7/7 packages
- `pnpm test` — green, 5/5 packages (`@sparstrow/core`: 84 files / 718 passing
  + 4 skipped)

### All 26 routes walked live

19 non-parameterised + 6 detail routes (synthetic ids, since the provisioning
bug below blocks seeding most entity types) + `/login`'s signed-in redirect.
Every one: **200, no page errors, no console errors or warnings** (checked
via `agent-browser errors`/`console` after every navigation, and again as a
full-session sweep at the end — empty throughout). The four deleted orphan
pages (`dashboard.tsx`, `knowledge.tsx`, `knowledge-article.tsx`,
`placeholder.tsx`) needed no separate check beyond this: `apps/web` already
owns `/`, `/knowledge`, and `/knowledge/[articleId]` natively, all three
confirmed rendering; `placeholder.tsx` was never a route.

**Went further than synthetic ids for the one page that matters most for
this plan.** Created a real team (`VR Verification Team`) through the actual
UI — the empty-state "New team" trigger, confirming last session's
double-dialog-mount fix holds — and fetched `/teams` with `curl` using the
session's own cookie, **bypassing JS entirely**. The raw server response
contained "VR Verification Team" twice: proof `T-VR-05`'s Server Component
genuinely delivers data in initial HTML, not a client fetch that happens to
resolve fast. Also confirmed on `/teams/tem_…` with the real id: sidebar
`aria-current="page"` on exactly one link (`Teams`), breadcrumb's last crumb
is `<span aria-current="page">` (not a link), both matching the interim
pass's finding on synthetic data.

### The six switched-off areas — all six checked, not five

- **Terminals** — page renders, "offline" badge, "No terminal attached"
- **Host-fs/Browse** — the New Project dialog's folder picker: "Cannot open
  this folder — Local filesystem access runs on the local daemon and is not
  available from the web app."
- **Local skill import** — "Copy from runtime" dialog: "Local skills runs on
  the local daemon and is not available from the web app."
- **Project git** — `GET /api/v1/projects/:id/git` → 501, confirmed via
  network log; page did not crash
- **Code graph** — `GET /api/v1/projects/:id/graph` → 501, confirmed by
  direct `fetch()` (no real project exists to reach the UI tab through — see
  below)
- **Providers** — `GET /api/v1/providers` → 501, confirmed by direct
  `fetch()`; the Settings → AI Providers panel itself renders cleanly with no
  crash, just no list, since it never issues the call without an active
  machine to scope it to

All six: expected stub, zero crashes. This matches `apps/web/src/lib/api/handlers/stubs.ts`'s
existing `hostLocalError`/`needsRuntimeError` pattern exactly — nothing here
is new; the check is that the Vite retirement didn't accidentally change it.

### Found while walking the create-project flow, not by looking for it: a real, severe bug

Attempting to create a real project (to reach the git/code-graph tabs with a
live entity instead of a 404 stub) failed every time — silently, no toast, no
console line, dialog just sat there. Traced to `POST /api/v1/projects/provision`
spreading two client-only fields (`mode`, `gitInit`) straight into the
`projects` table insert; neither is a real column, so PostgREST 400s before
anything is written. Filed as
[`BUG-2026-08-24-project-provision-always-400s`](../../bug/BUG-2026-08-24-project-provision-always-400s.md).

**Confirmed unrelated to this plan** — the route and the dialog both predate
`T-VR-*` untouched; this is a pre-existing defect this pass happened to
exercise. **Deliberately not fixed here**, per this task's own Traps section
and its Status line ("nothing else should be landing while it runs"). It was
severe enough to flag clearly at the time: project creation, the primary
path into the app's core object, was a complete no-op for every user.

**Fixed in a follow-up turn, after this task closed** — the owner asked for
it directly. See the bug file's own Resolution section for the fix and its
independent live verification; not detailed again here since it landed
after, not as part of, this task.

### Housekeeping found stale while closing this task

Two `KnownGaps.md` entries this pass's evidence directly bears on were
updated rather than left stale: **`G-23`** closed outright (both halves —
`apps/web` nav verified live with real credentials, and the "still open"
shell-merge half was already superseded by `D-24`, now executed). **`G-22`**
corrected in place — its "this environment lacks credentials" premise was
never true for this worktree; narrowed to what's actually still unwalked
(the specific rich states it names), not closed, since those weren't
produced by a disposable-account pass.

### What this does NOT close

- **`BUG-2026-08-24-project-provision-always-400s`** — 🟢 resolved, in a
  follow-up turn after this task closed.
- **`G-36`** (new) — Electron's offline screen was typechecked in `T-VR-01`,
  never rendered; this agent has no display to launch Electron with. Recorded
  as an accepted limitation of `D-24`'s architecture, not a regression.
- **Detail routes with real data**, beyond `/teams/[teamId]` — `/runs`,
  `/skills`, `/projects` etc. still only confirmed against synthetic ids,
  since seeding them needs either a paired machine or working project
  creation (blocked by the bug above).
- **The plan's own Result section** — filled in alongside this one; see
  [`plans/2026-08-24-retire-the-vite-app.md`](../../plans/2026-08-24-retire-the-vite-app.md).
