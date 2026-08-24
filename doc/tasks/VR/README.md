# VR — Retire the Vite app

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-24-retire-the-vite-app.md`](../../plans/2026-08-24-retire-the-vite-app.md) |
| **Spec** | n/a (internal) |
| **Status** | in progress — P1, P2 done 2026-08-24; P3 next |
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
| 2 | [T-VR-02 — move the pages](T-VR-02-move-pages.md) | `[S]` | 1 | ✅ done (2026-08-24) |
| 3 | [T-VR-03 — move the app-code components](T-VR-03-move-components.md) | `[S]` | 2 | not started |
| 4 | [T-VR-04 — un-shim, and delete the shim](T-VR-04-unshim.md) | `[S]` | 3 | not started |
| 5 | [T-VR-05 — one worked Server Component](T-VR-05-server-component.md) | `[S]` | 4 | not started |
| 6 | [T-VR-06 — verification](T-VR-06-verification.md) | `[S]` | 1–5 | not started |

**Fully decomposed 2026-08-24.** An earlier draft of this file deferred writing
tasks 2–6 until their predecessor landed. The owner asked for the whole phase
decomposed up front instead, and doing it surfaced two things a
write-as-you-go approach would have hit late and expensively: `packages/ui`
cannot import from `apps/web`, which reverses move and un-shim; and T-VR-01
orphaned four pages that are deletions rather than moves.

**Move order corrected 2026-08-24, on contact.** Components were briefly
scheduled before pages. Moving them first breaks every page still in
`packages/ui`; moving pages first breaks nothing, because a page in `apps/web`
still resolves `@/components/*` back to `packages/ui`. The attempt was reverted
and the two tasks swapped. It also grew T-VR-03 from nine files to ten —
`chat-bits.tsx` imports `markdown` and would otherwise have stranded a
`packages/ui` → `apps/web` import.
