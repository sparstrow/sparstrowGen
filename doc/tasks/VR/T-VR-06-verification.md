# T-VR-06 — verification

| | |
|---|---|
| **Tag** | `[S]` — grades the whole plan; nothing else should be landing while it runs |
| **Serves** | foundational — the plan's Verification table, executed |
| **Depends on** | T-VR-01 – T-VR-05 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | partially run 2026-08-24 — behaviour pass done on localhost; full pass still owed |

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

- [ ] Push the branch; confirm the Vercel preview builds
- [ ] `pnpm typecheck` and `pnpm test` green on the final tree
- [ ] Walk all 22 moved routes in a browser against the preview; for each,
      confirm it renders and its primary content loads
- [ ] Confirm the four deleted orphan pages have no route that 404s as a result
- [ ] Confirm the six switched-off areas (terminals, host-fs/Browse, project
      git, code graph, providers, local skill import) fail with their existing
      stub messages rather than crashing — the *expected* capability loss, not
      a new one
- [ ] Confirm no console errors introduced by the move — compare against the
      pre-plan baseline rather than assuming zero
- [ ] Confirm `NavLink`'s active state: the sidebar highlights exactly one
      destination, and the dashboard link is not permanently active
- [ ] Confirm the converted Server Component page (T-VR-05) delivers data in
      its initial HTML
- [ ] Open a `KnownGaps.md` entry recording the removed capability and what
      restores it, per the plan's Verification table
- [ ] Fill in the plan's Result section

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

<!-- Filled in when the task lands. -->
