# BUG-2026-08-27-dashboard-article-describes-a-transport-that-no-longer-exists

**Status:** 🔴 open
**Reported by:** agent — found while grepping the Knowledge Center for
"local WebSocket" during `T-M17-05`'s verification step (the same grep the
terminals article's own bug,
[`BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists`](BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists.md),
used to confirm its fix)
**Reported:** 2026-08-27

## Symptom

[`apps/web/src/content/knowledge/dashboard.md`](../../apps/web/src/content/knowledge/dashboard.md)
(`updated: 2026-07-13`) says: *"The queue count updates live over the local
WebSocket; 'offline' in the header means the core service is unreachable and
the queue may be stale."*

There is no local WebSocket involved. `useAttentionQueue()`
(`apps/web/src/api/hooks.ts`) is a plain REST poll —
`queryFn: () => api<AttentionRow[]>("/tasks/attention/queue")`,
`refetchInterval: 5000` — same transport class as every other list in the
app, not `wsHub`. This is the same root cause as
`BUG-2026-08-24-terminals-article-describes-a-transport-that-no-longer-exists`:
`wsHub` (dialing `/ws`) has been unreachable from the hosted app since Vercel
serves no WebSocket from a route handler, and `T-VR-01`'s Vite-host
retirement removed the only host where it ever worked. This article was
never corrected when that happened.

## Reproduction

1. Open `/knowledge/dashboard` in the hosted app.
2. Read the "Notes & limitations" section.
3. Compare against `useAttentionQueue()` in `apps/web/src/api/hooks.ts`.

Reproducible every time; it is static content describing a codepath that no
longer exists.

## Investigation

Not a runtime defect — same class of drift as `BUG-2026-08-24-...`, caught
by the same grep pattern (`local WebSocket`) while verifying that earlier
bug's fix didn't miss a sibling. Not investigated further than confirming
the actual transport (`useAttentionQueue`'s poll) and that no WebSocket
subscription exists anywhere in this data path.

**Also worth checking when this is fixed:** whether the "offline" header
badge's own meaning (`"the core service is unreachable"`) is still accurate
post-M5/M16, or whether it too describes a stale notion of connectivity —
not confirmed either way here, flagged for whoever picks this up.

## Impact

Low. The sentence describes *why* the count might be stale, which is
harmlessly wrong (the real reason — a failed poll — produces the same
user-visible symptom, a stale count). No feature is described as broken and
no user action depends on the transport detail being correct. Cosmetic
inaccuracy, not a functional dead end like the terminals bug was.

## Resolution

*(open — not fixed as part of `T-M17-05`, which found this while verifying
its own unrelated fix and filed it rather than expanding scope; see that
task's Result for why)*
