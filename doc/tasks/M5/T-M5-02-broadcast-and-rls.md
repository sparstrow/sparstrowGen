# T-M5-02 — Broadcast fan-out + `realtime.messages` RLS

| | |
|---|---|
| **Tag** | `[S]` sequential — edits the route 01 creates and adds the policy 05 depends on |
| **Depends on** | T-M5-01 |
| **Blocks** | T-M5-05, T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

The live half. After the durable write succeeds, the ingest route sends the same
batch as a Realtime broadcast on `run:<workspaceId>:<runId>`, and a policy on
`realtime.messages` lets exactly the workspace's members subscribe to it.

## Decisions already made

**The server sends, not the daemon** — phase decision 1, with the full argument
for why the custom-JWT alternative was rejected. The consequence for this task is
narrow and good: the sender already holds the service role and already knows the
workspace, so there is no new principal to authorize on the send side. The policy
below governs **subscribers only**.

**Topic is `run:<workspaceId>:<runId>`**, and a helper in
`packages/shared/src/cloud.ts` builds it so both ends cannot disagree:

```ts
export function runTranscriptTopic(workspaceId: string, runId: string): string {
  return `run:${workspaceId}:${runId}`;
}
export const TRANSCRIPT_BROADCAST_EVENT = "events";
```

**The policy is a membership check with no join**, matching every M1 policy:

```sql
create policy "members read their workspace transcript channels"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and split_part(realtime.topic(), ':', 1) = 'run'
  and split_part(realtime.topic(), ':', 2) in (select private.current_workspace_ids())
);
```

`in (select …)` rather than a function taking the value as an argument — M1
found that the argument form runs per row while this form is hoisted into a
single InitPlan. Keep the shape.

**No `insert` policy for `authenticated`.** Only the service role sends on these
topics, and it bypasses RLS. A client that can write to a transcript channel can
forge agent output, which is worse than it sounds: the browser merges broadcast
events into the same list as fetched ones.

**Broadcast failure never fails the request** — phase trap. The durable row is
already committed; a thrown send is logged at `warn` and the response is still
200. The browser's `seq` merge tolerates a missing delta and the refetch fills it.

**Chunking is by encoded byte length**, not event count. Build chunks by
measuring `JSON.stringify` of the accumulating payload against
`TRANSCRIPT_BATCH_MAX_BYTES`. A single event that alone exceeds the budget is
**not** sent as a broadcast; instead send a marker for its `seq`
(`{ oversized: [seq] }`) so the client refetches that range rather than
concluding the transcript ended.

The daemon already batches under the same ceiling, so chunking here is the
belt to that braces: a replayed catch-up batch after an outage can be far larger
than a live one, and that is precisely the moment the transcript matters.

## The send

`apps/web/src/lib/daemon/broadcast.ts`, a thin module with one job:

```ts
export async function broadcastRunEvents(
  workspaceId: string,
  runId: string,
  events: RunEventPush[],
): Promise<void>
```

Use the Realtime HTTP broadcast endpoint
(`POST ${SUPABASE_URL}/realtime/v1/api/broadcast`) with the service-role key,
not a `supabase.channel().send()` — a route handler is a short-lived function and
opening a WebSocket per request to send one message is the wrong shape. The HTTP
endpoint is stateless, which is what this caller is.

`private: true` on the message, so the policy above applies.

Live behind an env check: if the broadcast endpoint or key is absent, log once
at startup and no-op. A deployment configured for durability but not for live
delta should stream nothing rather than 500 every batch — and per
`MissingConfigError`, the reason should say which variable.

## Checklist

- [ ] `runTranscriptTopic()` and `TRANSCRIPT_BROADCAST_EVENT` in `packages/shared/src/cloud.ts`
- [ ] `apps/web/src/lib/daemon/broadcast.ts` — HTTP send, service role, `private: true`
- [ ] Byte-aware chunking; oversized single event sent as a marker, never dropped silently
- [ ] Wired into the T-M5-01 route **after** the durable write, never before
- [ ] A throwing broadcast leaves the response 200 and logs at `warn` with no payload
- [ ] `packages/shared/drizzle/policies/010_transcript_broadcast.sql` — select policy, no insert policy
- [ ] `010` is rerunnable (guarded `create policy`, same style as `002`)
- [ ] Applied to staging with `scripts/apply-sql.mjs`
- [ ] Unit tests: chunk boundaries, oversized event, send failure does not throw out of the route
- [ ] Isolation assertion added to `packages/shared/drizzle/policies/` verification: a member of B cannot select `realtime.messages` for an A topic

## Traps

**`realtime.topic()` is the function; `realtime.messages.topic` is the column.**
Inside a policy on `realtime.messages`, use `realtime.topic()` — the column is
not what you think it is on every path, and the function is the documented
accessor.

**Do not add `run_events` to the `supabase_realtime` publication.**
`002_realtime.sql` excludes it deliberately with a measured budget argument, and
phase decision 6 strengthens that argument rather than reopening it. Adding it
would deliver every event twice and spend the message budget on transcripts.

**The service-role key must not reach the client.** `broadcast.ts` lives under
`apps/web/src/lib/daemon/` for the same reason `auth.ts` does. No component
imports it, and nothing in it is exported from a module a client bundle can
reach.

**Chunk by encoded size, not `Buffer.byteLength` of the payloads alone.** The
envelope, the JSON escaping of already-JSON payloads, and base64 in tool results
all inflate the wire size. Measure the thing you are about to send.

**A workspace id in a topic is not authorization.** It makes the policy cheap;
the policy is what enforces access. Never skip the policy on the grounds that the
topic is unguessable.

## Verification

- [ ] Unit tests green
- [ ] `010` applied to staging and rerunnable without error
- [ ] Cross-workspace subscribe denial proved against staging → **T-M5-06**
- [ ] Live streaming to a second device → **T-M5-06**

## On completion

- [ ] Tick 7.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
