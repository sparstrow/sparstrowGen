# T-M16-01 — channel contracts

| | |
|---|---|
| **Tag** | `[S]` — four tasks in three packages are written against these names; a shape that changes after `T-M16-03` has authored a policy against it silently authorizes the wrong thing |
| **Serves** | **foundational** — unblocks all of M16, and M17 behind it |
| **Depends on** | — |
| **Blocks** | T-M16-02, T-M16-03, T-M16-04, T-M16-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Define, in `@sparstrow/shared`, the two topic families, every event name, every
message envelope and its Zod schema, and the size and rate limits. Nothing else
in M16 or M17 invents a name.

## Decisions already made

Phase decisions 1–3 and plan **DD-3** and **DD-8** govern this file.

**Topics.** Two helpers, shaped exactly like the existing `runTranscriptTopic` /
`chatTurnTopic` pair in `cloud.ts` so the policy in `T-M16-03` is a
`split_part(realtime.topic(), ':', 2)` membership test with no join:

```ts
/** Control: requests from a browser, replies from the machine. */
export function machineControlTopic(workspaceId: string, runtimeId: string): string {
  return `machine:${workspaceId}:${runtimeId}`;
}

/** One session's bytes, both directions. */
export function terminalSessionTopic(workspaceId: string, sessionId: string): string {
  return `terminal:${workspaceId}:${sessionId}`;
}
```

**Event names.** Pinned as constants because `T-M16-03`'s send policy matches on
them literally — a rename here is a silent grant change:

```ts
/** Browser → machine, on the control topic. Client-sendable. */
export const MACHINE_REQUEST_EVENT = "request";
/** Machine → browser, on the control topic. NOT client-sendable. */
export const MACHINE_REPLY_EVENT = "reply";
/** Browser → machine, on a session topic. Client-sendable. */
export const TERMINAL_INPUT_EVENT = "input";
/** Machine → browser, on a session topic. NOT client-sendable. */
export const TERMINAL_OUTPUT_EVENT = "output";
```

**The four control request kinds, and no fifth.** Plan Scope boundaries: this is
not a general machine-RPC layer.

| `kind` | Payload | Reply |
|---|---|---|
| `terminal.list` | — | `{ sessions: TerminalSessionInfo[], machineStartedAt }` |
| `terminal.open` | `{ agentId?: string \| null, cols, rows }` | `{ session }` or `{ error }` |
| `terminal.close` | `{ sessionId }` | `{ ok: true }` or `{ error }` |
| `terminal.attach` | `{ sessionId, cols, rows }` | `{ session, replay }` or `{ error }` |

**Every request carries a `requestId`** (nanoid, client-generated) and every
reply echoes it. The control topic is per machine, not per browser, so two tabs
issuing `terminal.list` at once both receive both replies; the `requestId` is how
each finds its own. A reply with an unrecognised `requestId` is dropped, not
logged as an error.

**Refusal reasons are a closed set**, because M17 renders a different sentence
for each and an unmatched string would fall through to a generic error — the
exact failure the spec exists to delete:

```ts
export type TerminalRefusal =
  | "terminal_access_disabled"   // the machine's own switch is off (US4)
  | "session_limit_reached"      // MAX_TERMINAL_SESSIONS
  | "unknown_session"            // reply carries machineStartedAt so the page can say why
  | "agent_not_interactive"      // provider.kind !== "cli"
  | "agent_not_found"
  | "spawn_failed";
```

**Limits** (DD-7, DD-8):

```ts
export const MAX_TERMINAL_SESSIONS = 10;
export const TERMINAL_OUTPUT_FLUSH_MS = 30;
export const TERMINAL_OUTPUT_FLUSH_BYTES = 8 * 1024;
export const TERMINAL_OUTPUT_MAX_BYTES = 64 * 1024;
export const TERMINAL_THROTTLE_BYTES_PER_SEC = 256 * 1024;
export const TERMINAL_THROTTLE_SUSTAIN_MS = 3_000;
export const MACHINE_REQUEST_TIMEOUT_MS = 10_000;
export const DAEMON_REALTIME_TOKEN_TTL_S = 600;
```

`MACHINE_REQUEST_TIMEOUT_MS` is what satisfies FR-014 — it is the point at which
the page stops waiting on a machine and says so.

**`SETTING_TERMINAL_ACCESS`** is defined here and added to
`DAEMON_SETTABLE_KEYS` (DD-9), so `T-M17-04` has no shared-package work of its
own. Values are the same `"true"`/`"false"` strings the existing WIP-snapshot
setting uses; absent means **on**.

## Checklist

- [ ] `packages/shared/src/schemas/terminal.ts` — envelopes and Zod schemas for
      every request kind, every reply, `TerminalSessionInfo`, input and output
      messages
- [ ] `packages/shared/src/cloud.ts` — the two topic helpers, the four event
      constants, the limits above, `SETTING_TERMINAL_ACCESS`, and its entry in
      `DAEMON_SETTABLE_KEYS`
- [ ] `packages/shared/src/index.ts` re-exports the new module
- [ ] Unit tests: each schema accepts a valid message and rejects a malformed one;
      the topic helpers produce exactly the documented strings
- [ ] A doc comment on each topic helper naming `017_terminal_channels.sql` as
      the policy that must match it — the same cross-reference `chatTurnTopic`
      carries
- [ ] `packages/shared` typecheck and tests green

## Traps

**`TerminalSessionInfo` is not `TerminalSession` from `packages/core`.** Core's
interface is a local type on a local module and carries `agentId` as a local
agent id. The wire type needs the agent's *name* as well, because the browser
cannot resolve a machine-local agent id — `terminals.tsx` currently resolves it
against the cloud agent list and gets `shortId(...)` when it misses. Carry both.

**Do not put `workspaceId` in any payload.** Phase decision 3: it comes from the
topic. A field that exists will eventually be read.

**The event constants are load-bearing strings, not labels.** `T-M16-03` pins
`realtime.messages.event` to `input` and `request`. Renaming either without
editing the policy widens or breaks the grant silently.

## Verification

- [ ] `pnpm --filter @sparstrow/shared test` green, including the new schema tests
- [ ] `pnpm typecheck` green across the monorepo — nothing else imports these yet,
      so this proves the module compiles and exports cleanly
- [ ] `grep` for the four event constants shows them defined once and used by name
      nowhere yet — later tasks are what consume them

## On completion

- [ ] Tick 20.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table

## Result

*(filled in when the task lands)*
