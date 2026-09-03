# Phase 4 — the vertical slice

**Plan:** [`2026-09-02-multica-architecture-restructure.md`](../plans/2026-09-02-multica-architecture-restructure.md)
**Branch:** `claude/multica-app-architecture-0a3e6f`
**Status:** 🟡 **four of six beats done and verified.** The dispatch spine is
proved end to end; the last two beats are blocked on a documented gap and on
routes that belong to Phase 5.

## The sentence this phase exists to make true

> install → open → sign in → **my machine is there** → pick an agent → send a
> message → it runs on my computer → output streams back

| Beat | State |
|---|---|
| install | ✅ `Sparstrowgen Setup 0.2.0.exe`, launched and inspected (Phase 3) |
| open | ✅ window renders the SPA, no Next.js, no bundled server (Phase 3) |
| sign in | ✅ browser loopback → PAT → OS keychain |
| **my machine is there** | ✅ daemon spawned, computer claimed, runtime registered, row visible in the app |
| pick an agent / send a message | 🟡 executes, but there is no POST route yet — see below |
| output streams back | ⬜ blocked by [`G-27`](../KnownGaps.md) |

## Result — what was actually run

`pnpm typecheck` 9/9. `pnpm test` 1696.

### Sign-in, verified against the running app

Drove the real flow and simulated only the step that **must** be a human —
clicking Confirm:

- the app created a real connect attempt: machine id, hostname,
  `is_electron: true`, callback `http://127.0.0.1:55352/callback`
- approving it and hitting the callback returned *"Connected. You can close this
  tab"*, and main logged `sign-in succeeded`
- the stored credential is 43 characters with no dots — a PAT, not a JWT
- `access_tokens.last_used_at` updates on every call, so revocation has
  something to be judged against

### "My machine is there", verified

```
[service] spawned core pid=37912 (detached)
[service] core is healthy
machine.claim(token) -> { ok: true, machineId: mach_9fac…, workspaces: 1 }
machine.status()     -> { connected: true, workspaces: 1, uptimeMs: 44823 }
```

and in the database, written by the daemon this app spawned:

```
machines  Sri desktop · win32 · DESKTOP-GJ8NLB8
runtimes  status online, heartbeating,
          capabilities ["claude-code","antigravity","ollama"]
```

and in the window: **Sri desktop · Windows · DESKTOP-GJ8NLB8 · v0.1.0 ·
Online**, with `bg-success` measured as `oklch(0.78 0.16 155)` and the Windows
mark rendering from `packages/views`.

### The dispatch spine, proved

A real chat turn was enqueued with a user session (the RPC refuses a service
role) and:

- was **assigned to this machine's runtime** by the control plane
- was **claimed by the daemon in under 10 seconds** — while the Realtime
  channel was `Unauthorized`, so this was the polling fallback working exactly
  as designed ("Realtime is only a doorbell")
- executed, and reported its outcome back to the control plane

The first attempt failed with a genuinely good error — *"This machine has no
agent with the slug `slice-probe`"* — which is the finding below.

## Two findings

**1. A cloud agent is not a machine agent.** Agents live in the daemon's local
SQLite and are linked to cloud rows *by slug*; creating an agent in the web UI
does not put it on any machine. The error message is excellent, but the product
story "pick an agent and send it a message" currently has a step in the middle
that nothing in the UI performs. This needs a decision, not a patch — filed as
[`OQ-12`](../OpenQuestions.md).

**2. [`G-27`](../KnownGaps.md) is confirmed, with measurements.** It was a
prediction from reading `healthCheck()`; it is now evidence. The probe reported
`claude-code` available, a turn ran to the full 120s ceiling and failed with
*"the provider timed out"*, and `claude -p` run **directly in the same shell**
also produced nothing in 100 seconds — while `claude --version` returned
`2.1.90` instantly.

⚠️ Stated carefully: that measurement was taken **inside a running Claude Code
session**, where a nested non-interactive `claude -p` may be blocked by the
context rather than by anything about this machine. What is proved is the
*shape* of the gap — `--version` succeeding says nothing about whether a run can
complete — not that the owner's CLI is broken.

## What is left, and why it is not a patch

- **`POST /chat/sessions` and `POST /chat/sessions/:id/messages` do not exist in
  `server/`.** Sending a message is still a Server Action, so the desktop app
  cannot send one. That is Phase 5 work reached early, and it is the right next
  slice.
- **No WebSocket yet**, so "output streams back" has no transport. The polling
  fallback already proves the data path; the WS is a latency improvement over a
  working design, not a missing foundation.

## Cleanup

Every probe row created during verification was deleted: the agent (cloud and
the machine's local copy), the chat session, its turns and messages, the queued
commands, and the temporary PAT. The desktop app's own session token remains,
which is the point of it.
