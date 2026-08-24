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
| 2 | [T-VR-02 — move the router-using components](T-VR-02-move-components.md) | `[S]` | 1 | not started |
| 3 | [T-VR-03 — move the pages](T-VR-03-move-pages.md) | `[S]` | 2 | not started |
| 4 | [T-VR-04 — un-shim, and delete the shim](T-VR-04-unshim.md) | `[S]` | 3 | not started |
| 5 | [T-VR-05 — one worked Server Component](T-VR-05-server-component.md) | `[S]` | 4 | not started |
| 6 | [T-VR-06 — verification](T-VR-06-verification.md) | `[S]` | 1–5 | not started |

**Fully decomposed 2026-08-24.** An earlier draft of this file deferred writing
tasks 2–6 until their predecessor landed. The owner asked for the whole phase
decomposed up front instead, and doing it surfaced two things a
write-as-you-go approach would have hit late and expensively: `packages/ui`
cannot import from `apps/web`, which reverses move and un-shim; and T-VR-01
orphaned four pages that are deletions rather than moves.
