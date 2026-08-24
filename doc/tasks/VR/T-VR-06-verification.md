# T-VR-06 — verification

| | |
|---|---|
| **Tag** | `[S]` — grades the whole plan; nothing else should be landing while it runs |
| **Serves** | foundational — the plan's Verification table, executed |
| **Depends on** | T-VR-01 – T-VR-05 |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Prove the plan's claim: **the app does exactly what it did before, minus the
removed host.** Typecheck and tests have been green at every step; this is the
part they cannot reach — that 22 routes still render, in a browser, on a real
deployment.

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
