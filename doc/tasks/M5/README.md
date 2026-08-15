# M5 — Transcripts (dual path)

| | |
|---|---|
| **Plan** | `doc/plans/2026-08-09-daemon-cloud-control-plane.md` (M5) |
| **Depends on** | M4 (complete — a run dispatched from the browser executes here and reaches a terminal state) |
| **Blocks** | nothing. M6 and M7 are `[P]` against this phase |
| **Status** | 01–05 done, 886 tests green · **06 (verification) deferred to the owner** — see [`G-13`](../../KnownGaps.md) |
| **Open questions** | none — everything below is decided |

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Depends on |
|---|---|---|
| [T-M5-01 — event ingest route + batch contract](T-M5-01-event-ingest-route.md) ✅ | `[S]` | — |
| [T-M5-02 — broadcast fan-out + `realtime.messages` RLS](T-M5-02-broadcast-and-rls.md) ✅ | `[S]` | 01 |
| [T-M5-03 — core transcript pusher](T-M5-03-transcript-pusher.md) ✅ | `[P]` | 01 |
| [T-M5-04 — durable replay: cursor, backfill, ceiling](T-M5-04-durable-replay.md) ✅ | `[C]` | 03 |
| [T-M5-05 — UI: live transcript over the right transport](T-M5-05-ui-live-transcript.md) ✅ | `[P]` | 02 |
| [T-M5-06 — verification](T-M5-06-verification.md) ⏸ | `[S]` | 01–05 |

This file holds what they share. Individual tasks reference it rather than
restating it.

## Objective

A run dispatched from the browser streams its transcript back, live, and the
transcript that survives is complete and correctly ordered even if the network
was not.

M4 proved the run *row* round-trips. `/runs/[runId]` currently renders that row
and an empty transcript, because `run_events` in Postgres has never had a row
written to it. M5 fills it, twice over: durably into Postgres, and live over a
Realtime broadcast the browser merges by `seq`.

**M5 does not build memory sync, chat streaming, or transcript archiving.** The
first is M6, the second has no cloud transport yet and is not in this plan's
milestones, and the third is [D-3](../../Deferred.md) with a hard precondition
attached to it.

## Definition of done

- A run started from the browser shows its transcript filling in **while it
  runs**, on a device that is not the machine executing it
- Killing the daemon's network for 60 seconds mid-run loses **nothing**: on
  reconnect the cloud transcript is complete, in `seq` order, with no gaps and
  no duplicate `seq`
- The final cloud `run_events` count for a run equals the local count
- A daemon token for workspace A cannot write events for a run in workspace B,
  and a browser session in workspace B cannot subscribe to A's transcript channel
- A single batch larger than the Realtime payload cap is chunked, not dropped and
  not truncated
- `pnpm -r typecheck` and `pnpm -r test` stay green

---

## Decisions already made

These were resolved while scoping. Do not re-open them.

### 1. The daemon does not connect to Realtime. The server broadcasts.

The plan's decision 2 says live deltas are broadcast over Realtime *from the
daemon*, and M4's decision 1 deferred daemon Realtime auth to here on the
grounds that "M5 has to pay that cost anyway."

**M5 does not pay it.** The daemon POSTs each batch to
`POST /api/daemon/runs/:id/events`, and that route — which already holds the
service role and has already resolved the caller's workspace from the bearer
token — writes the rows and fans the same batch out as a broadcast in the same
request.

The reason is not effort, it is blast radius. Daemon-side broadcast needs a
custom JWT carrying a `runtime_id` claim, signed with the Supabase JWT secret,
minted by a new endpoint, refreshed on a timer in core, and authorized by
`realtime.messages` policies that must understand **two** kinds of principal —
a member with an `auth.uid()` and a runtime with neither. That is a second
authentication model for the daemon, three months after the first one, to shave
latency off a path that is already batched at one second.

Sending from the server costs one `fetch` inside a route that is already
running, keeps the service role exactly where `apps/web/src/lib/daemon/auth.ts`
says it lives, and inherits M3's containment rule unchanged: the workspace comes
from the token, so a runtime physically cannot broadcast into another
workspace's channel.

**What this costs, stated plainly:** one extra hop between the event happening
and the browser seeing it — a single Vercel function invocation the batch was
already making. Against a batch window that is deliberately ~1s wide, it is not
observable.

**What this defers:** the Realtime doorbell for command dispatch, again. The
daemon still has no Realtime connection, so dispatch latency stays bounded by
the 3s poll. Parked as [D-12](../../Deferred.md) rather than silently carried
into M6, with the honest note that the poll works and the doorbell is a latency
improvement.

**What would change this:** the daemon needing to *receive* anything push-shaped
— live HITL approvals, interactive chat turns, cancel-within-100ms. At that
point the JWT is load-bearing rather than an optimization, and the doorbell and
daemon-side broadcast both come along for free.

### 2. The local `run_events` table **is** the offline buffer

The plan asks for "an offline buffer with a spill ceiling". Core already writes
every event to local SQLite `run_events` before it publishes to the bus
(`recordEvent`, `run-manager.ts:547`) — durably, indexed by `(run_id, seq)`, on
the machine that will do the replaying. A second buffer would be a copy of that
table with a worse index and its own truncation bugs.

So the buffer is a **cursor**: `cloud_event_cursors(run_id, pushed_through_seq)`,
core migration `0017`. Push = "select from the local table where `seq >
pushed_through_seq`". Replay after a 60-second outage, after a crash, and after a
week offline are all the same query, which is the property worth having.

The spill ceiling becomes a **staleness ceiling** — see decision 6.

### 3. Batch on whichever comes first: count, time, **or bytes**

`TRANSCRIPT_BATCH_MAX_EVENTS` (25), `TRANSCRIPT_BATCH_INTERVAL_MS` (1000), and
`TRANSCRIPT_BATCH_MAX_BYTES` (128 KB), all in `packages/shared/src/cloud.ts`
beside M4's constants.

The byte budget is the one the plan does not mention and the one that breaks in
production. The plan's own measurement says `tool_result` payloads average 4.9 KB
and reach **16.9 KB**, and concludes they are "under the 256 KB Realtime cap" —
which is true per event and false per batch. Sixteen large tool results is a
276 KB broadcast that Realtime rejects, and the natural way to write this loop
counts events.

128 KB rather than 256 KB because the broadcast envelope, JSON escaping of
payloads that are already JSON, and base64 in tool results all inflate the wire
size above the sum of the payloads measured locally. Half the cap is margin, not
timidity.

A **single event** larger than the budget is sent alone and still written to
Postgres; it is only the broadcast that may be skipped for it, with a marker so
the browser refetches rather than believing the transcript ended.

### 4. Only dispatched runs push — and the existing membership set is wrong for this

`run_events.run_id` has a foreign key to `runs.id`. A run the cloud never
dispatched — cron, a handoff, the local UI — has no cloud row, so pushing its
transcript is a constraint violation retried forever.

M4's `isDispatched()` in `cloud/run-reporter.ts` already answers "did the cloud
ask for this run", and M5 reuses it. **But it cannot reuse it unchanged**:
`startRunReporter` calls `dispatched.delete(run.id)` the moment a run reports
terminal, and the last and most interesting events of a run — the result, the
error, the final tool output — are flushed *after* that. Reusing the set as-is
would silently truncate the end of every transcript, which is the hardest
failure to notice because the page looks finished.

Ownership of that set moves to a small module both subscribers share, and it is
released only when the transcript pusher has flushed through the run's final
`seq`. [T-M5-03](T-M5-03-transcript-pusher.md) owns the change.

### 5. Idempotency is the composite primary key, and the insert is an upsert-ignore

`run_events` is `primaryKey(run_id, seq)` — M1 put it there for exactly this
reason, and the schema comment says so. Every ingest is
`upsert(..., { onConflict: "run_id,seq", ignoreDuplicates: true })`.

A replayed batch is therefore free, and the pusher never has to know whether its
last request landed before the socket died. **Do not** "optimise" this into a
plain insert after observing that duplicates are rare; rare is the whole problem.

### 6. One broadcast per batch, not per event

`002_realtime.sql` excluded `run_events` from the `postgres_changes` publication
with a measured argument: ~23 events per run against a 2M message/month budget,
delivered twice if both paths were on.

Broadcasting per **batch** improves on that argument rather than reopening it: a
typical run becomes 2–5 messages instead of 23, and the payload is the events
themselves rather than a signal that provokes a refetch. `run_events` stays out
of the publication. Do not add it.

### 7. The channel is private, per run, and its topic carries the workspace

Topic: `run:<workspaceId>:<runId>`. Private channel, authorized by RLS on
`realtime.messages`:

```sql
split_part(realtime.topic(), ':', 2) in (select private.current_workspace_ids())
```

The workspace id is in the topic so the policy is a membership check with no
join — the same shape as every M1 policy, which is why it is easy to be sure it
is right. A run id alone would force the policy to join `runs`, and a
workspace-wide topic would deliver every run's transcript to every open tab.

The workspace id is not a secret from a member, and the policy — not the topic —
is what enforces access. A non-member who guesses the topic is refused at
subscribe.

### 8. `wsHub` is the local UI's transport and must not be the hosted app's

`packages/ui/src/lib/ws.ts` dials `wss://<host>/ws`. In the local, core-served UI
that is a real Fastify WebSocket. **In the hosted app there is no `/ws` route and
there cannot be one** — Vercel does not serve WebSockets from Next route
handlers — so `wsHub` has been reconnecting on a 500 ms→5 s backoff against a
404 since the day `apps/web` shipped, and `app-shell.tsx:109` renders a
connection chip driven by it.

Nothing has been visibly wrong because nothing live existed to miss. M5 makes it
wrong: the transcript will be streaming while the shell says the app is offline.

The live source becomes transport-agnostic — Realtime in the hosted app,
`wsHub` in the local UI — and the chip reports whichever one is actually in use.
[T-M5-05](T-M5-05-ui-live-transcript.md) owns it. This is not scope creep; it is
the surface M5's data arrives on.

---

## The shape of the change

One new daemon route, one SQL policy file, one new core module, one core
migration, and a UI transport swap.

| Route | Purpose |
|---|---|
| `POST /api/daemon/runs/:id/events` | Upsert a batch of run events; fan the batch out over the run's broadcast channel |

`/api/daemon/*` remains the daemon's surface keyed on a bearer token; `/api/v1/*`
remains the browser's keyed on the session cookie. M3's containment rule in
`apps/web/src/lib/daemon/auth.ts` applies unchanged.

## Files

| Path | Change |
|---|---|
| `packages/shared/src/cloud.ts` | edit — `RunEventBatch`, `TRANSCRIPT_*` constants, broadcast payload contract, topic helper |
| `apps/web/src/app/api/daemon/runs/[id]/events/route.ts` | new — batch upsert + broadcast |
| `apps/web/src/lib/daemon/broadcast.ts` | new — server-side Realtime send, service role, chunking |
| `packages/shared/drizzle/policies/010_transcript_broadcast.sql` | new — `realtime.messages` RLS for `run:<ws>:<run>` |
| `packages/core/src/cloud/transcripts.ts` | new — bus subscription, batching, push, cursor advance |
| `packages/core/src/cloud/run-reporter.ts` | edit — dispatched-set ownership moves out; release after final flush |
| `packages/core/src/db/schema.ts` + `migrations.ts` | edit — `cloud_event_cursors`, migration `0017` |
| `packages/core/src/index.ts` | edit — start/stop the pusher beside the command loop |
| `packages/ui/src/routes/pages/run-detail.tsx` | edit — live events from an injected source, not `wsHub` directly |
| `packages/ui/src/lib/live-events.ts` | new — the transport-agnostic live source |
| `apps/web/src/components/providers.tsx` | edit — install the Realtime-backed source |
| `apps/web/src/components/layout/app-shell.tsx` | edit — chip reflects the transport actually in use |
| `packages/ui/src/content/knowledge/*.md` | edit — transcripts now reach the cloud; see `AGENTS.md` §3.2 |

## Traps

**`RunEvent.id` does not exist in the cloud.** The local table has an
autoincrement `id`; cloud `run_events` is keyed on `(run_id, seq)` and has no
`id` column, but `runEventSchema` in `packages/shared/src/schemas/run.ts:47`
declares `id: z.number().int()`. `GET /runs/:id/events` already returns rows
without it. Nothing crashes today because `run-transcript.tsx:173` keys on
`seq` — fix the contract, do not rely on that.

**`GET /runs/:id/events` caps at 500 and `useRunEvents` never paginates.**
`hooks.ts:790` defaults `limit` to 500 and the page requests once. A transcript
longer than 500 events is silently truncated — and until M5 no cloud transcript
was long enough to notice. Paginate, or the phase ships a lie for exactly the
long runs it was built to watch.

**A push for a run with no cloud row must not retry forever.** The FK violation
is permanent. Drop the run from the pusher, log once, and do not let one
un-dispatched run's events block the queue behind it.

**Payloads are user content and provider output.** Prompts, file contents, tool
results. They go to Postgres by design; they do **not** go in a log line, and
`err` objects from a failed batch must not carry the batch body.

**The service role bypasses RLS.** Every write in the ingest route carries
`workspace_id` from the token scope, and the run's ownership is verified before
the upsert — not after, and not by trusting the path parameter. M4's status
route shipped this defect and it was only caught live.

**Broadcast failure is not ingest failure.** If the durable write succeeds and
the broadcast throws, the request is a success. The browser's `seq` merge and
its refetch-on-focus already cover a missed delta; failing the request would make
the daemon replay a batch that is already stored.

**Two batches for the same run must not be in flight at once.** Out-of-order
arrival is harmless for the durable path (upsert by `seq`) and visible on the
live path. Serialise per run.

**Do not let the flush timer hold the process open.** Same `unref()` requirement
as the heartbeat and the command loop, for the same reason.

## Verification

Full procedure in [T-M5-06](T-M5-06-verification.md). The assertions that matter:

1. **A transcript streams to a second device while the run is executing.**
2. **A 60-second network outage mid-run loses nothing** — final cloud count
   equals local count, `seq` is contiguous, no duplicates.
3. **A batch over the byte budget is chunked**, and the transcript is intact.
4. **Cross-workspace isolation holds** for ingest (token) and for subscribe
   (session) — re-proved through HTTP and through a real Realtime subscribe,
   because the ingest route holds the service role.
5. **The last events of a run are present** — the truncation decision 4 exists
   to prevent, asserted rather than eyeballed.
