# T-M18-05 — core reads the workspace policy from the cloud

| | |
|---|---|
| **Tag** | `[C]` — edits [`tool-resolution.ts`](../../../packages/core/src/agents/tool-resolution.ts), which sits on the spawn path |
| **Serves** | **foundational** — makes `FR-007`'s workspace level a real level rather than a per-machine one |
| **Depends on** | T-M18-04 |
| **Blocks** | M20 (US3's workspace-defaults surface) |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Make the Global level of the tool-policy chain read the **cloud** workspace
columns `T-M18-04` added, with the stricter-of fallback plan DD-3 specifies.

Today `readGlobalToolPolicy()` reads `tools.global.allowed` from **each daemon's
own SQLite `settings` table**
([`tool-resolution.ts:12`](../../../packages/core/src/agents/tool-resolution.ts:12)).
The spec calls this level "workspace-wide" and expects one screen to set it —
but as built, two paired machines have two independent global policies. Left
alone, `FR-007` would ship a settings screen that silently only affects
whichever machine happened to answer.

## Decisions already made

### The fallback is to the **stricter** of {last known cloud value, local rows} — never simply to local

Plan DD-3, and this is the whole reason the task is not trivial.

A machine that cannot reach the cloud must not silently become **less**
restricted. Falling back to the local `settings` rows — which today hold
whatever was last set locally, usually nothing — would widen a policy at exactly
the moment nobody is watching. So:

```
cloud reachable        → cloud value, cached
cloud unreachable      → stricter_of(last cached cloud value, local settings rows)
never once reached     → local settings rows, and log that it is running on local policy
```

"Stricter of" is `intersectEffectiveTools`, which already exists and already
means LEAST privilege. Do not write a second one.

### The cache refreshes on the existing command poll, not on a new timer

`COMMAND_POLL_INTERVAL_MS` already runs every 3 s
([`packages/shared/src/cloud.ts`](../../../packages/shared/src/cloud.ts)). The
workspace policy rides that response rather than adding a second schedule — the
same reasoning M5's decision 1 used to decline a second daemon auth model for a
doorbell.

### The local `settings` rows stay and are not migrated

They are the never-reached fallback and they are what a fully offline
development machine runs on. Deleting them would make an unreachable cloud mean
"no policy", which is the widening this decision exists to prevent.

### The resolution order and the four levels are unchanged

Plan DD-7. This task changes **where the Global level's value comes from**, and
nothing else. `resolveRunEffectiveTools`'s signature, the Global → Agent →
Project → Task order, the delegation intersection — all identical.

## Checklist

- [ ] Core fetches the workspace's `allowed_tools`/`disallowed_tools` on the existing command poll and caches them
- [ ] `readGlobalToolPolicy()` returns the cloud value when one has ever been fetched
- [ ] Unreachable-cloud path returns `intersectEffectiveTools(lastCached, localRows)`
- [ ] Never-reached path returns the local rows **and logs it**, once per process, not per run
- [ ] `resolveRunEffectiveTools`'s signature and behaviour otherwise unchanged
- [ ] Tests: cloud reachable; cloud unreachable with a cached value that is stricter; cloud unreachable with local rows that are stricter; never reached
- [ ] A test asserting the unreachable path can **never** return a superset of the last cached cloud policy — the property this decision exists for
- [ ] `packages/core` typecheck and tests green

## Traps

**This is on the spawn path of every run.** A throw here does not degrade a
screen; it stops work executing. The cloud fetch must never be able to reject
into `resolveRunEffectiveTools` — catch at the fetch boundary and fall back,
which is what the decision above describes.

**The snapshot is taken once, at spawn, and must stay that way.**
`tool-resolution.ts`'s doc comment: *"Called once at spawn; the result is
snapshotted on the run and the provider reads only the snapshot, so mutating any
row while the run is queued cannot change what it may touch."* A cache that
refreshes mid-run is fine — a *resolution* that re-runs mid-run breaks
`FR-010` and the spec's US3 scenario 2. Do not move the resolution call.

**`@sparstrow/daemon` does not exist yet.** `AGENTS.md` §4 — the daemon's code
lives in and runs as `@sparstrow/core` until that split is done deliberately.
Do not create `packages/daemon/` for this.

**"Stricter" is not obvious for allow-lists.** Two empty allow-lists intersect
to empty, which means *provider default*, which is the **loosest** state, not
the tightest. `intersectEffectiveTools` already handles this asymmetry
correctly and its reasoning is in its doc comment — read it before hand-rolling
a comparison.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green for `packages/core`
- [ ] With the cloud reachable, a workspace-level denial set in Postgres appears in a spawned run's `effective_tools` snapshot — checked against the row, not against a log line
- [ ] With the cloud stopped mid-session, a run spawned afterwards still carries the last cached denial
- [ ] On a machine that has never reached the cloud, a run spawns successfully and the local-policy log line appears exactly once
- [ ] The superset property test fails if the fallback is deliberately changed to return the local rows directly — **run it broken once**

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped at integration on
> `development` by whoever hands out the next wave (`AGENTS.md` §2.8).
> Sibling tasks in this band are adjacent rows in one table, so ticking your
> own row conflicts with every one of them. Record this task's outcome in the
> **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table
- [ ] If the live cloud-reachable check could not be run, open a
      [`KnownGaps.md`](../../KnownGaps.md) entry in this same change

## Result

*Filled in when the task lands.*
