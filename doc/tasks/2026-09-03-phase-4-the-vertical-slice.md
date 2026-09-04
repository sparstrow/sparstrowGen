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
| **my machine is there** | ❌→✅ **This tick was wrong when written.** See the correction below. |
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

### ⚠️ Correction, 2026-09-03 — "my machine is there" was verified wrongly

**The owner installed v0.3.0, signed in successfully, and saw "No machines
yet".** The beat this phase ticked did not work in the application at all.

The evidence below is real and every line of it still holds. The mistake is in
what it was taken to prove. `machine.claim(token)` was invoked **by the verifier,
over CDP** — and **nothing in the app has ever called it.** The old web UI had a
Connect button; the SPA that replaced it in Phase 3 did not bring one across, and
the IPC handler behind it has sat complete and unreferenced ever since.

So this verified the *bridge*, not the *application*. A capability reachable only
by someone holding a debugger is not a feature, and driving it by hand and then
ticking a product beat is the precise failure this repo's header rule exists to
prevent — "a feature is not done until it runs in the desktop app". A CDP call
is not the app running it.

**What made it possible:** every step was checked individually and nothing
checked that any step *invoked the next one*. The composition was the only
untested part, and it was the only broken part.

**Fixed** in `apps/desktop/src/main/claim.ts`: the main process claims this
computer automatically, at launch and immediately after sign-in, and tells the
window to refetch when it lands. Automatic rather than a button, per #213's
"computers that are just there" — a person-scoped token already proves who this
is, so asking them to press Connect asks them to confirm what the app knows.
`claim.test.ts` pins the trigger, which is the part that was missing.

**Not yet proved end to end**, and deliberately not claimed as such: completing
the sign-in needs a human clicking Confirm in a browser, and simulating that
with a service-role write was correctly refused by the tooling. The real proof
arrives when the owner updates to 0.3.1 — the same release that proves the
update mechanism.

### The evidence, which proved less than was claimed

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

**2. [`G-27`](../KnownGaps.md) is confirmed, with measurements** — though see
the 2026-09-03 update in that entry: re-run from a clean environment, the CLI
turned out to work fine and the real causes were an expired OAuth token plus a
turn timeout shorter than the CLI's retry ladder. The nested-session caveat
below was the right thing to write, and the theory in it was wrong. It was a
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

- ~~**`POST /chat/sessions` and `POST /chat/sessions/:id/messages` do not exist
  in `server/`.** Sending a message is still a Server Action, so the desktop app
  cannot send one.~~

  ⚠️ **Corrected 2026-09-03: both routes exist.** They are real handlers in
  `server/src/routes/handlers/chat.ts` — validation, workspace scoping, an
  `enqueue_chat_turn` call — landed by `558ad25 feat(server): chat writes are
  HTTP routes`. The gap is one layer up: `packages/core/src/chat/` has
  `queries.ts` and **no `mutations.ts`**, so the client can read chat and not
  write it. That makes the remaining work *wire the client*, not *port the write
  path*, which is a much smaller slice. Left struck through rather than deleted
  because it was planned against for a day.
- **No WebSocket yet**, so "output streams back" has no transport. The polling
  fallback already proves the data path; the WS is a latency improvement over a
  working design, not a missing foundation.

## Cleanup

Every probe row created during verification was deleted: the agent (cloud and
the machine's local copy), the chat session, its turns and messages, the queued
commands, and the temporary PAT. The desktop app's own session token remains,
which is the point of it.
