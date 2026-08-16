# T-M8-01 — `machineState()` in `@sparstrow/shared`

| | |
|---|---|
| **Tag** | `[S]` — defines the vocabulary T-M8-02 renders; nothing else in the phase compiles against a label that does not exist yet |
| **Serves** | `US1` — a machine reads as active or unreachable, and never claims a cause it cannot know |
| **Depends on** | — |
| **Blocks** | T-M8-02 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

> 5. **Given** a machine is running and reachable, **When** I look at it,
>    **Then** it reads as active, with its name, OS, hostname, core version and
>    what it can run.
> 6. **Given** a machine has stopped talking — off, asleep, crashed or
>    disconnected — **When** I look at it, **Then** it reads as **unreachable**
>    with when it was last seen, and does **not** claim to know which of those
>    happened.

Rendering is T-M8-02's job. This task owns the **decision** behind the label.

## Objective

Add one exported function to `packages/shared/src/cloud.ts` that turns
`(status, lastHeartbeat, now)` into a single label, so FR-006 is decided in one
place and FR-007 — "the status model MUST leave room for **sleeping** to be
added without reshaping it" — is satisfied by construction.

## Decisions already made

Phase decisions 1 and 2 are the source. The exact shape:

```ts
export type MachineState = "active" | "unreachable" | "draining";

/**
 * What to CALL a machine, from what it declared and when it last spoke.
 *
 * Two states plus `draining` this round. Sleep detection is D-16; when it
 * lands, a daemon declares `status = 'sleeping'` BEFORE it suspends and this
 * function gains one branch. That is the whole reason the label is computed
 * here rather than in the row that renders it.
 */
export function machineState(
  status: string | null | undefined,
  lastHeartbeat: string | Date | null | undefined,
  now: number = Date.now(),
): MachineState {
  const reachable = isRuntimeOnline(lastHeartbeat, now);
  if (!reachable) return "unreachable";
  if (status === "draining") return "draining";
  return "active";
}
```

**Reachability is checked first, and that ordering is the decision.** A machine
that declared `draining` and then went quiet **is** unreachable — it may have
finished shutting down twenty minutes ago, or it may have been unplugged
mid-drain, and we cannot tell. Saying "shutting down" about it asserts a cause
we do not know, which is exactly the rule spec decision 1 used to reject
"turned off". Reversing the order would produce a machine stuck on "shutting
down" forever.

**`isRuntimeOnline` is not changed, wrapped, or deprecated.** Three callers
want the boolean — [`runtimes.ts:94`](../../../apps/web/src/lib/api/handlers/runtimes.ts:94),
[`runtimes.ts:301`](../../../apps/web/src/lib/api/handlers/runtimes.ts:301) and
[`system.ts`](../../../apps/web/src/lib/api/handlers/system.ts) — and they are
asking a different question ("may I dispatch to this?") than the UI is
("what do I call it?"). `machineState` is built on it, not instead of it.

**No migration, no change to `runtimes.status`.** Phase decision 2.

## Checklist

- [ ] `MachineState` type and `machineState()` added to
      `packages/shared/src/cloud.ts`, beside `isRuntimeOnline`, with the
      doc-comment above (the D-16 sentence is the point of it — do not trim it)
- [ ] Exported from `packages/shared/src/index.ts` if that file re-exports
      explicitly rather than with `export *` — check before assuming
- [ ] Tests in `packages/shared/src/cloud.test.ts` covering:
      fresh heartbeat + `online` → `active`;
      fresh heartbeat + `draining` → `draining`;
      stale heartbeat + `draining` → `unreachable` (the ordering case);
      stale heartbeat + `online` → `unreachable`;
      `null` heartbeat → `unreachable`;
      unparseable heartbeat string → `unreachable`;
      exactly `HEARTBEAT_STALE_AFTER_MS` old → `unreachable` (boundary);
      one millisecond younger → `active`;
      `null`/`undefined`/unknown `status` with a fresh heartbeat → `active`
- [ ] `pnpm --filter @sparstrow/shared test` and `pnpm typecheck` green

## Traps

**`NaN` must read as unreachable, not active.** `isRuntimeOnline` already
handles this with the deliberately awkward `!(age >= X)` form, and its comment
explains why — building on it inherits the fix. Reimplementing the comparison
here reintroduces the bug.

**Do not add `"offline"` as a synonym.** The codebase uses `offline` in the
database default and in older prose. The user-facing word this phase ships is
**unreachable**, chosen because it does not assert a cause (spec decision 1).
One vocabulary, in one function.

**Do not add `sleeping` now.** It is [`D-16`](../../Deferred.md). The type is
shaped so it costs one branch later; adding it early ships a state nothing can
ever produce, which is worse than absent.

## Verification

- [ ] `pnpm --filter @sparstrow/shared test` — all nine cases above pass
- [ ] `pnpm typecheck` clean across the workspace
- [ ] Grep confirms no existing call site was changed: `isRuntimeOnline` still
      has exactly its current three callers

## On completion

- [ ] Tick 10.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
