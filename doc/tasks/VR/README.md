# VR — Retire the Vite app

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-24-retire-the-vite-app.md`](../../plans/2026-08-24-retire-the-vite-app.md) |
| **Spec** | n/a (internal) |
| **Status** | in progress — P1 done 2026-08-24, P2 next |
| **Serves** | foundational throughout — no user story exists, nothing the owner can see is meant to change |

Executes [`D-24`](../../Deferred.md): one Next.js UI, Electron as a shell,
`packages/ui` narrowed to a design system.

## What this phase is graded on

**Nothing looks different afterwards.** There is no feature here. The plan is
correct when every one of the 26 routes renders exactly as it did, and the
only behaviour change is the deliberate capability loss recorded in the plan's
decision 1 — six areas that already return 501 in the browser stop working in
the local UI too, because the local UI is gone.

## Order, and why it is not the obvious one

Delete first, un-shim second, move last. The reasoning is in the plan's Phases
section; the short version is that the Vite host is a closed set nothing else
imports, and while it exists every shared component has to satisfy two routers.
Removing it first shrinks everything after it.

## Tasks

| # | Task | Tag | Depends on | Status |
|---|---|---|---|---|
| 1 | [T-VR-01 — delete the Vite host](T-VR-01-delete-vite-host.md) | `[S]` | — | ✅ done (2026-08-24) |
| 2 | T-VR-02 — un-shim the components and pages | `[S]` | 1 | not written |
| 3 | T-VR-03 — move the files into `apps/web` | `[S]` | 2 | not written |
| 4 | T-VR-04 — one worked Server Component | `[S]` | 3 | not written |
| 5 | T-VR-05 — verification | `[S]` | 1–4 | not written |

Tasks 2–5 are written as their predecessor lands, not up front: each one's
shape depends on what the previous one actually left behind, and writing five
speculative task documents is how a plan acquires steps nobody needed.
