# T-M5-05 — UI: live transcript over the right transport

| | |
|---|---|
| **Tag** | `[P]` parallel — `packages/ui` and `apps/web` presentation; no overlap with the core or SQL work |
| **Depends on** | T-M5-02 |
| **Blocks** | T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-12 |

## Objective

`/runs/[runId]` fills in while the run is executing, in the hosted app, on a
device that is not the one running it.

The merge logic needed for this already exists and is untouched:
`run-detail.tsx:36-41` merges fetched and live events into a `Map` keyed by
`seq`. What does not exist is a live source the hosted app can actually receive
on.

## Decisions already made

**`wsHub` is the local UI's transport and cannot be the hosted app's** — phase
decision 8. `packages/ui/src/lib/ws.ts` dials `wss://<host>/ws`; Vercel does not
serve WebSockets from Next route handlers and `apps/web` has no `/ws` route. That
socket has been failing and reconnecting on a 500 ms→5 s backoff since `apps/web`
shipped. Nothing looked broken because nothing live existed to miss — M5 is what
makes it a visible lie, because the transcript will be streaming while
`app-shell.tsx:109`'s chip says the app is offline.

**Introduce a live-event source, injected, not imported.**
`packages/ui/src/lib/live-events.ts`:

```ts
export interface LiveEventSource {
  subscribeRun(runId: string, onEvent: (e: RunEvent) => void): () => void;
  onStatusChange(fn: (connected: boolean) => void): () => void;
  readonly isConnected: boolean;
}
```

`packages/ui` ships the `wsHub`-backed implementation (today's behaviour,
extracted, no change in semantics) and a React context with it as the default.
`apps/web/src/components/providers.tsx` installs a Realtime-backed one.

Injected rather than sniffed, because "am I in the hosted app" is a question the
component should never ask — the two hosts differ in more than this and the ones
that sniffed are the ones that broke (`G-6` is the standing example: a control
that rendered in one host and silently did nothing in the other).

**The Realtime implementation subscribes per run, not globally.** Channel
`run:<workspaceId>:<runId>`, `{ config: { private: true } }`, event
`TRANSCRIPT_BROADCAST_EVENT`. Subscribe when the page mounts for an active run;
unsubscribe on unmount and when the run reaches terminal — `run-detail.tsx`
already gates on `isActive`, so reuse it. A channel left open per visited run is
how a tab accumulates a hundred subscriptions.

**The chip reports the transport in use.** In the hosted app that is the Realtime
connection state; in the local UI, `wsHub`. Same component, value from the
context.

**The oversized marker means refetch, not "the end".** T-M5-02 sends
`{ oversized: [seq] }` when a single event exceeds the broadcast budget. The
client refetches events after the last contiguous `seq` rather than rendering a
transcript that stops.

## Pagination — the part that is not optional

`useRunEvents` (`packages/ui/src/api/hooks.ts:785`) defaults to `limit: 500`,
requests once, and never uses its own `afterSeq` parameter. The server caps at
2000 (`apps/web/src/lib/api/handlers/runs.ts`). Until M5 no cloud transcript had
500 events, so the truncation was unreachable.

It is reachable now, and it fails in the worst direction: a long run — precisely
the kind someone opens this page to watch — renders a transcript that simply
stops, with no indication anything is missing.

Page it: fetch forward with `afterSeq` set to the highest `seq` held, until a
response comes back short. The query key stays `["run-events", id]` so
invalidation elsewhere keeps working.

## Checklist

- [x] `packages/ui/src/lib/live-events.ts` — interface, `wsHub`-backed default, React context
- [x] `run-detail.tsx` consumes the context instead of importing `wsHub` directly; the `seq` merge is unchanged
- [x] `apps/web/src/components/providers.tsx` installs a Realtime-backed source
- [x] Realtime source: per-run private channel, unsubscribed on unmount and on terminal
- [x] `app-shell.tsx` chip driven by the context, not by `wsHub` directly
- [x] `useRunEvents` pages forward with `afterSeq` until a short response
- [x] Oversized marker triggers a refetch of the gap
- [x] The local, core-served UI behaves exactly as it does today — same socket, same chip
- [x] 38 unit tests on the extracted pure logic (6 merge, 4 wsHub source, 7 pagination, 14 Realtime source, 7 elsewhere) — see the Result section for what this does NOT cover.

## Traps

**The merge must survive a delta arriving before the initial fetch resolves.**
Live events land in `liveEvents` state and fetched ones in the query cache; the
`useMemo` merges both, so this already works — do not "simplify" it into
appending to the fetched array, which drops everything that arrived early.

**Do not add `run_events` to the `postgres_changes` subscription in
`providers.tsx`.** The existing `db-changes` channel invalidates React Query keys
on row changes for eleven tables. Transcripts deliberately do not ride it —
`002_realtime.sql` says why, and phase decision 6 restates it. Adding a
`run_events` case there would double-deliver and burn the message budget.

**Unsubscribing is not automatic.** A `supabase.channel()` left open survives the
component. Return `removeChannel` from the effect, and key the effect on
`runId` — navigating between two runs must not leave the first one subscribed.

**The connection chip is load-bearing in a way it was not before.** It is how a
user distinguishes "this run is quiet" from "I am not receiving". Getting it
wrong in the new direction — showing connected while the channel is dead — is
worse than today's permanent-offline, because today's is at least conservative.

**Do not change the local UI's behaviour.** `packages/ui` is shared, `wsHub` is
correct there, and `G-2` already records that the local UI has been under-observed.
This task must not add to that.

## Verification

- [x] 38 unit tests green (886 total across the monorepo)
- [ ] Live streaming from a second device, and the local UI unchanged → **T-M5-06**
- [ ] A >500-event transcript renders in full → **T-M5-06**

## On completion

- [x] Tick 7.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — 2026-08-12

`live-events.ts`, `realtime-live-events.ts`, `run-detail.tsx`/`app-shell.tsx`
switched over, `useRunEvents` pagination, and 38 tests. `pnpm -r typecheck`
clean, 886 tests green across the monorepo.

### `Run` never carried a `workspaceId`, and the wire already did

The Realtime source needs a workspace id to build `run:<workspaceId>:<runId>`,
and nothing client-side exposed one. `GET /runs/:id` already returns it —
`select("*")` plus the generic camelCase converter means it has been sitting
on the wire, unread, since M2 — the shared `Run` type simply never named it.
Added as `workspaceId?: idSchema.optional()`: optional because local core's
SQLite `runs` table has no workspace column and never will, so a required
field would make every local response fail validation for a value that
structurally cannot exist there.

Resolved once per browser session in `RealtimeLiveEventSource`, not once per
run: a signed-in session belongs to exactly one workspace in practice
(multi-workspace switching is deferred), and it is the SUBSCRIBER's own
membership that grants access to a topic — not anything about the specific
run being watched, which RLS would already have refused to load if it
belonged to a workspace this session cannot see.

### The oversized-marker refetch was missing until the checklist caught it

First draft left `payload.oversized` unhandled with a comment claiming React
Query's cache already covered it. It doesn't: `refetchOnWindowFocus` is off
(`providers.tsx`), nothing else re-triggers `useRunEvents`, and without an
explicit refetch a gap from an oversized live event sits unfilled until the
user happens to navigate away and back — exactly the silent-truncation
failure this phase exists to close. Fixed by giving `RealtimeLiveEventSource`
an optional `QueryClient` (passed from `providers.tsx`, where one already
exists) and calling `invalidateQueries({ queryKey: ["run-events", runId] })`
when a broadcast reports one. Optional, not required: nothing about
subscribing or receiving live events needs a query client, so a caller
without one just doesn't get the refetch rather than crashing.

### The honest gap: no component was ever mounted

`packages/ui` has zero `.test.tsx` files and no `@testing-library/react` (or
jsdom) in its dependency tree — this is the first UI work in the M5 effort,
and the pattern every prior M5 task used still applied: extract the judgment
into a plain function or class, test THAT directly, leave the React glue thin.
So `mergeRunEvents`, `WsHubLiveEventSource`, `fetchAllRunEvents`, and
`RealtimeLiveEventSource` are all directly tested — 38 tests — and none of
them required rendering a component.

What that does NOT cover, stated plainly: `run-detail.tsx`'s own `useEffect`
wiring (does it actually call `subscribeRun` at the right time, does changing
`isActive` actually tear down and rebuild the subscription, does the chip
visually reflect what `useLiveEvents()` returns) has never been exercised —
not even once, not in this task. Installing testing-library for one task
felt like the wrong tradeoff against the size of what M5 actually needed
proven; the live pass in **T-M5-06** is where "does the page really do this"
gets answered, on a second device, for real. If that pass reveals a wiring
bug, this is the class of bug it would be — the pure logic underneath was
correct, but nothing ever proved the effect calling it was.

### Left unresolved on purpose, and stated rather than silently absorbed

The task's phase README calls the doorbell decision "the daemon does not
connect to Realtime, the server broadcasts" — this task's Realtime source is
the other end of that same design, and it inherits the same tradeoff: a
browser tab watching a run holds one Realtime channel per active run, torn
down the moment the run stops being active (`isActive` gating the effect).
Multiple tabs watching the same run each open their own channel — no sharing,
no dedup. At the scale this phase was measured against (one person, one
machine, one run at a time), that is the right amount of complexity; it would
not be at fleet scale, and is worth revisiting if `/runs/[runId]` becomes
something teams watch together.
