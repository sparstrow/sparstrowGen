# T-M5-02 — Broadcast fan-out + `realtime.messages` RLS

| | |
|---|---|
| **Tag** | `[S]` sequential — edits the route 01 creates and adds the policy 05 depends on |
| **Depends on** | T-M5-01 |
| **Blocks** | T-M5-05, T-M5-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 010 applied to staging 2026-08-11 |

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

- [x] `runTranscriptTopic()` and `TRANSCRIPT_BROADCAST_EVENT` in `packages/shared/src/cloud.ts`
- [x] `apps/web/src/lib/daemon/broadcast.ts` — HTTP send, service role, `private: true`
- [x] Byte-aware chunking; oversized single event sent as a marker, never dropped silently
- [x] Wired into the T-M5-01 route **after** the durable write, never before
- [x] A throwing broadcast leaves the response 200 and logs at `warn` with no payload
- [x] `packages/shared/drizzle/policies/010_transcript_broadcast.sql` — select policy, no insert policy
- [x] `010` is rerunnable (guarded `create policy`, same style as `002`)
- [x] Applied to staging with `scripts/apply-sql.mjs`
- [x] Unit tests: chunk boundaries, oversized event, send failure does not throw out of the route
- [~] Isolation assertion — **deferred to [T-M5-06](T-M5-06-verification.md) §E**.
      It needs two real signed-in sessions subscribing; a SQL-level assertion
      would only re-state the policy text back to itself.

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

- [x] 19 unit tests green
- [x] `010` applied to staging and rerunnable without error
- [ ] Cross-workspace subscribe denial proved against staging → **T-M5-06**
- [ ] Live streaming to a second device → **T-M5-06**

## On completion

- [x] Tick 7.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — 2026-08-11

`broadcast.ts`, `010_transcript_broadcast.sql` applied to staging, and 19 tests.
Also `apps/web/vitest.config.ts` — see below.

### 010 is the first policy on a table this project does not own

`realtime.messages` belongs to `supabase_realtime_admin`, and `postgres` is not
a member of it. `create policy` works as `postgres`; `alter table … enable row
level security` returns *must be owner of table messages*.

So the task's `alter table` line could not ship. Rather than dropping it
silently — which would leave the file quietly depending on a setting it never
checks — 010 now **asserts** RLS is enabled and raises if it is not, with the
consequence spelled out in the exception: every private channel would be
world-readable and the policy would be decoration.

Verified on staging before applying: RLS already on (Supabase's default), and
**zero** existing policies on the table. So this change only grants, and could
not have broken anything that worked. After applying and re-applying: exactly
one policy, `SELECT`, `{authenticated}`, no `INSERT` policy.

### The env-check clause was replaced by something simpler

The task specified a startup env check that would log once and no-op if the
broadcast key or URL were missing. That turned out to be a second mechanism for
a case the first one already covers: `broadcastRunEvents` swallows *every*
failure — Realtime down, key absent, payload rejected — because the transcript
is already durable and propagating would make the daemon resend rows it has
already stored. Missing config throws, is caught, and is logged like any other
failure.

It is also very nearly unreachable: this needs the same
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` that
`authenticateDaemon()` already required to get this far.

### Awaited, not fire-and-forget

The obvious shape for "must not block the response" is `void broadcast(...)`.
That is wrong on Vercel: a function may be frozen once the response is sent, so
the send would sometimes silently never happen and would be undebuggable when it
did not. Awaited, with every failure swallowed, costs one round trip and is
deterministic.

### An oversized event is named, not dropped

A single event too large for any message is stored durably and its `seq` is sent
as an `oversized` marker on the first chunk, so the client refetches the gap
instead of rendering a transcript that appears to end. When *every* event was
oversized there is no chunk to attach it to, so a marker-only message is sent —
the case a chunking loop naturally forgets.

### `apps/web` had no vitest config

There was none, so tests ran on vitest's defaults and resolved nothing from
`tsconfig.json`. Every existing web test happened to exercise a module whose own
imports were relative or into `@sparstrow/shared`; `broadcast.ts` imports
`@web/utils/supabase/env`, which is how the rest of the app is written, and
failed at collection. Added with the alias mirroring `tsconfig`'s `paths`,
because a module that typechecks and then cannot be imported by a test is a
silent disincentive to writing the test.
