# Ideas

Unscoped. No commitment, no decision behind them, possibly never built. If an
idea graduates, it becomes a plan in `doc/plans/` — or gets a decision and moves
to `Deferred.md`.

Distinct from `Deferred.md`: those were agreed and parked. These were merely
noticed.

---

## I-1 — Same-LAN direct daemon connection

Decision 2 routes every command through the cloud, which is correct for
correctness and NAT traversal. But when the browser and the daemon are on the
same network — the common desktop case — a direct local connection would cut a
round trip for transcript streaming and chat turns.

Only ever as an *optimization layered on* the cloud path, never as the primary
transport: exposing the daemon's host-process API is precisely what core's
`cors: { origin: false }` was added to prevent.

*Surfaced while scoring Decision 2 Option C.*

---

## I-2 — Full-text search across run transcripts

Once transcripts are in Postgres, "which run touched this file / hit this error"
becomes answerable. Cheap while transcripts stay in the database; needs a
separate index if D-3 ever moves them to Drive, which is an argument for building
it before archiving rather than after.

---

## I-3 — Cross-run cost and behaviour analytics

`runs` already carries `cost_usd`, `num_turns`, `duration_ms`, and
`effective_tools`. Aggregating across runs would answer: which agent is
expensive, which tools actually get used, where time goes, whether a prompt
change helped.

The `GraphUsageLine` component in `run-detail.tsx` already does a miniature
version of this for graph tools — counting `tool_use` blocks out of the
transcript — so the pattern exists.

---

## I-4 — Ephemeral per-task git workspaces (Multica model)

Multica never binds user-chosen paths: it clones into
`~/multica_workspaces/{workspace_id}/{task_id_short}/` per task and
garbage-collects when the issue closes. Portability becomes free — a project is
just a git URL — and `runtime_projects` bindings largely stop mattering.

Rejected for now because it gives up working in-place on an existing checkout
with uncommitted changes, which is how this repo is actually used. Worth
revisiting as an *option per project* rather than a global mode — sandbox and
`is_sandbox` projects are the natural candidates.

---

## I-5 — Self-hosted Postgres

Removes the free-tier ceiling, gives backups on your own terms, and makes
transcript retention a non-issue. Rejected during Decision 1 because it trades
"management is easier" — the actual reason cloud-canonical won — for an
operational burden.

Only interesting if self-hosting becomes necessary for another reason.

---

## I-6 — Surface memory-retrieval failures in the UI

`buildMemoryBlock` catches retrieval errors and silently falls back to recency:

```js
} catch (err) {
  logger.warn({ err }, "memory retrieval failed — falling back to recency");
}
```

The run still succeeds — it just quietly had worse context. Today this barely
matters because retrieval is a local file read that can't time out. It would
matter a lot if memory ever moved to a network call (see D-5), and it's cheap to
surface now: the run detail page already renders a "Memory injected:" row, so a
degraded-retrieval badge has an obvious home.

---

## I-7 — Stale-reference sweep

`packages/core/src/db/schema.ts` cites
`docs/archive/fable-handoff/P3-SEAM-TABLE.md`, which does not exist — there was
no `doc/` or `docs/` directory in the repo at all before this one. Worth a pass
over code comments for other pointers to files that have moved or were never
committed.
