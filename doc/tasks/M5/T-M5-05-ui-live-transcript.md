# T-M5-05 — UI: live transcript over the right transport

| | |
|---|---|
| **Tag** | `[P]` parallel — `packages/ui` and `apps/web` presentation; no overlap with the core or SQL work |
| **Depends on** | T-M5-02 |
| **Blocks** | T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `packages/ui/src/lib/live-events.ts` — interface, `wsHub`-backed default, React context
- [ ] `run-detail.tsx` consumes the context instead of importing `wsHub` directly; the `seq` merge is unchanged
- [ ] `apps/web/src/components/providers.tsx` installs a Realtime-backed source
- [ ] Realtime source: per-run private channel, unsubscribed on unmount and on terminal
- [ ] `app-shell.tsx` chip driven by the context, not by `wsHub` directly
- [ ] `useRunEvents` pages forward with `afterSeq` until a short response
- [ ] Oversized marker triggers a refetch of the gap
- [ ] The local, core-served UI behaves exactly as it does today — same socket, same chip
- [ ] Component tests: merge dedupes by `seq`; a delta arriving before the fetch resolves is not lost; unsubscribe on unmount; pagination stops on a short page

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

- [ ] Component tests green
- [ ] Live streaming from a second device, and the local UI unchanged → **T-M5-06**
- [ ] A >500-event transcript renders in full → **T-M5-06**

## On completion

- [ ] Tick 7.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
