# T-DI-01 — the session topic carries the runtime id

| | |
|---|---|
| **Tag** | `[S]` — defines the topic contract every later task authorizes against |
| **Serves** | **foundational** — makes `T-DI-02`'s daemon `output` policy able to check runtime ownership at all |
| **Depends on** | — |
| **Blocks** | T-DI-02, T-DI-03, T-DI-04, T-DI-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-27) |

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

- [x] `packages/shared/src/cloud.ts` — `terminalSessionTopic(workspaceId,
      runtimeId, sessionId)`, with its docblock updated to say why the runtime
      id is in there (it is the only thing a daemon-side policy can check a
      session against, per `D-26`)
- [x] `apps/web/src/lib/terminal-channel.ts` — `attach()` and `send()` pass the
      channel's own `runtimeId`, which `RealtimeTerminalChannel` already holds
      as a constructor field
- [x] The session channel is opened with the machine's own runtime id, taken
      from the pairing state, **never from a message** — landed in
      `realtime.ts`'s `openSessionChannel`, not `terminal-bridge.ts`; see Result
- [x] `packages/shared/drizzle/policies/018_terminal_channels.sql` —
      `terminal_channel_admin_read` and `terminal_channel_admin_send` keep
      `split_part(…, ':', 2)` for the workspace; add nothing else. The policies
      do **not** gain a runtime check for the browser side — an admin may
      already reach every machine in their workspace, and adding one here would
      be a behaviour change smuggled into a rename
- [x] Update `018`'s header comment where it describes the topic shape, and its
      `-- Verify` block's example topics
- [x] Unit tests updated: `terminal-channel.test.ts`'s topic-lookup helper and
      two literal assertions; `schemas/terminal.test.ts`'s topic assertion
- [x] `pnpm typecheck` and `pnpm test` green

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

- [x] `pnpm typecheck` green (7/7 tasks) and `pnpm test` green (5/5 tasks;
      `@sparstrow/core` 87 files / 748 passed, 4 skipped)
- [x] A test asserts the produced topic string literally, not by re-calling the
      helper — plus a second test asserting each `split_part` position by index,
      added because all three arguments are opaque strings and a transposition
      would be a silently wrong policy rather than a type error
- [x] `grep -rn "terminal:"` across `.ts`/`.sql`/`.md` shows no remaining 3-part
      construction — the only hits left are the new 4-part form, `018`'s updated
      comments, and two unrelated `terminal: boolean` fields in
      `run-reporter.ts`/`transcripts.ts`

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Record this
> task's outcome in the **Status** row and **Result** section of *this* file.

- [x] Update this file's **Status** row
- [x] Update the phase README's task table

## Result

**The daemon-side call site is in `realtime.ts`, not `terminal-bridge.ts`** as
this task's checklist assumed. `openSessionChannel()` lives in `realtime.ts`
(the connection module) and `terminal-bridge.ts` only calls it by session id —
which is `T-M16-04`'s two-module split working exactly as designed: the bridge
knows about request kinds and the manager, and knows nothing about topics or
channels. `realtime.ts` already imported `getRuntimeId` alongside
`getWorkspaceId` for the control topic, so the change was one extra resolve
guarded by the same `if (!workspaceId || !runtimeId) return null`.

**Four production call sites, not three**: the shared helper, the browser
channel client, core's session channel, and `018`'s comments. Plus three test
sites and one stale docblock in `schemas/terminal.ts` that described the old
shape.

**A second test was added beyond the checklist.** The original asserted the
whole string, which catches a wrong shape but not a transposition — all three
arguments are `string`, so passing `(workspace, session, runtime)` typechecks
and produces a plausible-looking topic that authorizes the wrong pair. The new
test pins each `split_part` position by index with the policy's own index in a
comment, so the SQL and the TypeScript state the same contract in the same
terms.

**`018` gained a header section rather than just an edited line.** It now says
explicitly that it is the browser's half only, points at `019` for the machine's,
and records why *this* file deliberately does not check the runtime id — an
admin already reaches every machine in their workspace, so adding a check here
would be a behaviour change smuggled into a rename. Its `-- Verify` block now
says six rows from 010/015/018 and **ten** once `019` lands.

**Not applied to the database.** `018`'s text changed but only in comments — no
policy predicate moved, because the browser policies read `split_part(…, ':',
2)` and the workspace is still in position 2. So the live project is not stale
with respect to this task; `T-DI-02` is where `018` gets re-run alongside the
new `019`.
