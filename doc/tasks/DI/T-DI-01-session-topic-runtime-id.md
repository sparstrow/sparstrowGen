# T-DI-01 — the session topic carries the runtime id

| | |
|---|---|
| **Tag** | `[S]` — defines the topic contract every later task authorizes against |
| **Serves** | **foundational** — makes `T-DI-02`'s daemon `output` policy able to check runtime ownership at all |
| **Depends on** | — |
| **Blocks** | T-DI-02, T-DI-03, T-DI-04, T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Change one string shape — `terminal:<ws>:<session>` becomes
`terminal:<ws>:<runtime>:<session>` — across the shared helper, both consumers,
and `018_terminal_channels.sql`'s two terminal policies.

## Decisions already made

Plan **DI-2** governs this task in full, including why it is worth doing now
rather than later (zero sessions exist in any environment, so there is no
migration and no compatibility window; doing it after real sessions exist would
need both shapes supported at once).

**The workspace id stays first.** `split_part(realtime.topic(), ':', 2)` remains
the workspace, so the browser policies stay a membership test with no join —
`DD-3`'s reason, unchanged. The runtime id becomes `':', 3` and the session id
`':', 4`.

**`machineControlTopic` does not change.** It is already
`machine:<ws>:<runtime>` and already carries everything a policy needs.

## Checklist

- [ ] `packages/shared/src/cloud.ts` — `terminalSessionTopic(workspaceId,
      runtimeId, sessionId)`, with its docblock updated to say why the runtime
      id is in there (it is the only thing a daemon-side policy can check a
      session against, per `D-26`)
- [ ] `apps/web/src/lib/terminal-channel.ts` — `attach()` and `send()` pass the
      channel's own `runtimeId`, which `RealtimeTerminalChannel` already holds
      as a constructor field
- [ ] `packages/core/src/cloud/terminal-bridge.ts` — the session channel is
      opened with the machine's own runtime id, taken from the pairing state
      that `realtime.ts` already resolved, **never from a message** (the same
      rule M16 phase decision 3 states for the control topic)
- [ ] `packages/shared/drizzle/policies/018_terminal_channels.sql` —
      `terminal_channel_admin_read` and `terminal_channel_admin_send` keep
      `split_part(…, ':', 2)` for the workspace; add nothing else. The policies
      do **not** gain a runtime check for the browser side — an admin may
      already reach every machine in their workspace, and adding one here would
      be a behaviour change smuggled into a rename
- [ ] Update `018`'s header comment where it describes the topic shape, and its
      `-- Verify` block's example topics
- [ ] Unit tests updated: the existing `terminal-channel.test.ts` topic-lookup
      helpers, and any `cloud.test.ts` assertion on the topic string
- [ ] `pnpm typecheck` and `pnpm test` green

## Traps

**`018` is already applied to the live project.** Editing the file is not
applying it — `T-DI-02` applies both `018` (re-run, it is idempotent by design)
and the new `019` together, against a project ref confirmed twice. Do not apply
a half-changed policy set from this task.

**The browser and the daemon must agree on the shape in the same commit.** A
browser subscribing to a 4-part topic while a daemon publishes to a 3-part one
produces exactly the symptom this whole phase exists to remove: a subscribed
channel that is silent, with nothing in any log to say why.

**`terminalSessionTopic` has three string arguments after this change**, all of
them opaque ids, and TypeScript will not catch a transposition. Order them
`workspace, runtime, session` to match the topic left-to-right, and let the test
assert the produced string rather than the argument order.

## Verification

- [ ] `pnpm typecheck` and `pnpm test` green across `packages/shared`,
      `apps/web` and `packages/core`
- [ ] A test asserts the produced topic string literally, not by re-calling the
      helper — a helper compared against itself passes under any shape
- [ ] `grep -rn "terminal:" --include=*.ts --include=*.sql` shows no remaining
      3-part construction anywhere, including comments and test fixtures

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Record this
> task's outcome in the **Status** row and **Result** section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

*(filled in when the task lands)*
