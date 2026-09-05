# Phase 4 remainder — make an agent reply

**Plan:** [`2026-09-02-multica-architecture-restructure.md`](../plans/2026-09-02-multica-architecture-restructure.md) §Phase 4
**Branch:** `claude/multica-app-architecture-0a3e6f`
**Status:** 4a, 4b, 4c and 4e done — the loop closes at the protocol level.
**4d (chat surface) and model discovery remain, and are the last things between
this and the phase gate.** Detail and sequencing:
[`2026-09-04-finish-the-slice-and-the-first-screens.md`](../plans/2026-09-04-finish-the-slice-and-the-first-screens.md).

## The sentence still to make true

> pick an agent → send a message → **it runs on my computer** → output streams back

## 4a. Prove the provider ✅ done 2026-09-03

Ran first precisely because a negative answer would have made 4b–4d pointless.
The answer was positive, so they are worth building.

`claude -p --output-format stream-json --verbose --max-turns 1`, every
`CLAUDE*`/`ANTHROPIC*` variable stripped to match what
`orchestrator/child-env.ts` gives a spawned agent:

```
CLAUDE*/ANTHROPIC* vars remaining: 0
claude 2.1.90
elapsed 186.1s, exit 1
{"error_status":401,"error":"authentication_failed"}   x10, exponential backoff
"OAuth access token has expired. Re-authenticate to continue."
```

**The CLI and the provider integration both work.** Two real findings replaced
one vague one:

- ~~**The owner's `claude` OAuth token is expired.**~~ **Retracted.** The test
  stripped the four auth variables the allowlist forwards. Keeping the
  persistent User-scope set, the same command returns `"result":"PONG"` in
  10.1 s. Nothing needs re-authenticating.
- **`TURN_TIMEOUT_MS` (120 s) < the CLI's retry ladder (~186 s)**, so the daemon
  kills the run before the CLI says why and reports *"the provider timed out"*
  for an auth failure — [`BUG-2026-09-03`](../bug/BUG-2026-09-03-turn-timeout-masks-the-real-provider-error.md).

## 4e. Provider credentials come from saved settings ✅ done 2026-09-03

Found by the owner pointing at multica running the same CLI fine on the same
machine, which disproved the retracted claim in one sentence.

`agentChildEnv` read provider credentials off `process.env`, so a daemon started
from an agent's shell handed `claude` an endpoint with **no** credential:

```
persistent scope : CLAUDE_CODE_OAUTH_TOKEN = sk-ant-oat01...   (valid)
agent's shell    : ANTHROPIC_BASE_URL = https://api.anth...  and NO token
```

Guaranteed 401 → ~186 s of retries → killed at 120 s → "the provider timed out".
This is the complete explanation of the original Phase 4 failure.

**Fixed** in `server/src/orchestrator/provider-env.ts`: discovery from the
persistent Windows environment (`HKCU`/`HKLM`), resolved **per provider group,
never per key** — `ANTHROPIC_BASE_URL` decides where a token is spent, so a
per-key fallback rebuilds the same bug from two reasonable halves. The first
version of the fix did exactly that; running it against the real machine caught
it. Verified in the poisoned context:

```
[anthropic] configured persistently: true
    ANTHROPIC_BASE_URL        DROPPED (ambient https://api.anthropi...)
    CLAUDE_CODE_OAUTH_TOKEN   persistent  sk-ant-oat01-J...
```

844 server tests pass; `pnpm typecheck` 9/9 and `pnpm test` 7/7 across the
monorepo.

**Multica's shape, different route.** It inherits `os.Environ()` plus a
per-agent `CustomEnv` from the agent settings UI, with a blocklist. Per-agent
overrides remain worth building (4d's Settings surface is where they belong);
the allowlist stays, because it is a stronger posture than a blocklist for a
process that can run Bash.

## 4b. The daemon syncs workspace agents down (OQ-12 option A)

- [ ] Daemon pulls its workspace's agents and upserts them into local SQLite,
      keyed by slug — the link the dispatcher already expects
- [ ] Re-sync on the existing heartbeat/command loop; no new transport
- [ ] An agent created in the app appears on the machine without a manual step
- [ ] Deleting or renaming one does not orphan a running turn

The failure this closes is a real error message already seen: *"This machine has
no agent with the slug `slice-probe`"*. The dispatch spine either side of it is
proved.

## 4c. Wire chat sending in the client

- [ ] `packages/core/src/chat/mutations.ts` against the routes that **already
      exist** in `server/src/routes/handlers/chat.ts` — no new server work
- [ ] Chat surface in `packages/views`, navigation injected not imported
- [ ] Desktop renders it; polling is sufficient, the WS is a later latency win

## 4d. Model discovery (OQ-11)

- [ ] Discover providers and models from Windows environment variables, the way
      multica does (`references/multica`, read-only)
- [ ] Keep the list current as providers ship models; no hardcoded snapshot
- [ ] List all of a provider's non-deprecated models
- [ ] **Settings surface in the same slice** (`AGENTS.md` §3.14)

## Worth fixing while here

[`G-27`](../KnownGaps.md) and the bug above are the same situation seen from two
sides — predicting an auth failure, and reporting one. Both are closed by
reading what the CLI already says: an `api_retry` event carrying
`error_status: 401` arrives about a second in and is terminal, not transient.
Acting on it turns a 186-second silence into an immediate *"your Claude CLI
needs re-authenticating"*.

## Done when

The owner sends a message from the desktop app and sees a reply. Not when tests
pass.

## Result

**4a, 4b, 4c and 4e are done and verified; the sections below record each one.**
`pnpm typecheck` 9/9, `pnpm test` 7/7, 859 server tests. Merged to `main` via
[#234](https://github.com/sparstrow/sparstrowGen/pull/234) and
[#235](https://github.com/sparstrow/sparstrowGen/pull/235), **without a version
bump** — deliberately, per `AGENTS.md` §2.9. The protocol loop works, but the
desktop window still has only Machines and Settings, so a release would have
been one the owner could not check.

**What remains is 4d and model discovery**, planned in detail in
[`2026-09-04-finish-the-slice-and-the-first-screens.md`](../plans/2026-09-04-finish-the-slice-and-the-first-screens.md).
The phase gate is unchanged: the owner sends a message from the desktop app and
sees a reply.


## 4b. The daemon syncs workspace agents down (OQ-12 option A) — done 2026-09-04

`GET /api/daemon/agents` in `server/src/routes/daemon/index.ts`, and
`server/src/cloud/agent-sync.ts` on the daemon side. Pulled at boot, on the
heartbeat's reconcile tick, and on demand when a dispatch names a slug this
machine does not hold — the last one is what stops "create an agent then message
it" from depending on when the periodic sync last ran.

### Verified end to end, against local Docker Supabase and a real `server/`

Not a unit-test rerun. Local Supabase (43 tables), `server/` on :8280 with the
daemon routes mounted, signed in as `agent@sparstrow.com`, and the daemon's own
`syncAgents`/`ensureAgentLocal` driven against it.

**Server side — the route (steps 1-8):**

| # | check | result |
|---|---|---|
| 1 | sign in as the local agent account | user `67369a0c…` |
| 2 | workspace resolved | `d2085eb9…` |
| 3 | agent created as a **cloud row only** | `e2e-probe-042ce0` |
| 4 | machine + runtime + hashed machine token | `mch_e637…` / `rt_c5f4…` |
| 5 | `GET /api/daemon/agents` | 3 agents, including the probe |
| 6 | a **quarantined** agent is withheld | withheld |
| 6 | a **system** agent is withheld | withheld |
| 7 | another workspace's agent | not visible to this runtime |
| 8 | unknown runtime / bogus token | 404 / 401 |

Step 6 is the one worth keeping. P9 quarantines an imported skill precisely so
it cannot run until a person promotes it; handing one to a machine as a runnable
agent would walk through that gate on a box the reviewer never looked at.

**Daemon side — the sync (steps 9-15):**

| # | check | result |
|---|---|---|
| 10 | the agent is absent locally to begin with | absent, so the test is not vacuous |
| 11 | `ensureAgentLocal` pulls it | `agt_qVKS-SuAaU`, model and provider intact |
| 12 | `resolveAgent` now succeeds | resolves to that local id |
| 13 | a second sync is idempotent | 3 rows before and after |
| 14 | a local-only agent survives a sync | `local-only-probe` survived |
| 15 | withheld agents never reach local SQLite | neither is present |

Log line from the run, which is the behaviour in one sentence:

```
agent is not on this machine yet - pulling the workspace's agents before dispatching
    agentSlug: "e2e-probe-042ce0"
```

**Step 14 was wrong on its first run and is worth recording.** It asserted "0
local-only agents survived" against a fresh data dir — vacuously true, proving
nothing about the guarantee that matters most (a sync must never delete). It now
plants an agent that exists in no workspace, syncs, and checks it is still
there.

855 server tests pass (11 new), `pnpm typecheck` clean.

### What this does NOT prove, and what now blocks the reply

**A full "message an agent and get a reply" still does not work**, and the reason
has moved. It is no longer the agent link:

```
GET /api/daemon/commands  ->  404
```

`server/` serves 10 daemon routes; the command-delivery half is not among them.
A turn can be assigned in the cloud, but the daemon has nothing to poll, so it
never learns about it. That is the next piece of work, not a defect in 4b.


## 4c. Command delivery — done 2026-09-04, and **the loop closed**

Ported `GET /commands`, `POST /commands/:id/ack`,
`POST /chat/turns/:id/events` and `POST /chat/turns/:id/result` into
`server/src/routes/daemon/`, plus `chat-transcript.ts` and `reconcile.ts`. The
daemon router gained path parameters, which it did not have.

**The Supabase Realtime broadcast is deliberately not ported.** The restructure
replaced Realtime with a server-owned WebSocket and `D-37` parks the Realtime
bridge, so the durable write came across and the fan-out did not. The
consequence, stated rather than buried: a reply lands when the turn completes
instead of streaming in progressively.

### The whole loop, on a real stack

```
[25] Assign a real turn to the running daemon
    OK   turn ct_508afefdeb62 queued for runtime rt_c5f45a6bc829
    ..   in_progress/seq0
    ..   succeeded/seq2  reply="PONG"

    OK   THE AGENT REPLIED: "PONG"
    ..   command row: done
```

Local Docker Supabase, `server/` on :8280, and the **real daemon** — not a
harness — claiming the command, resolving the agent it had synced at boot,
spawning the Claude Code CLI, and posting the reply back.

Route-level checks 16–24, all passing: the command is delivered with its
payload and the workspace tool policy; a second poll does not re-deliver it
(the lease holds); events persist; the result closes the turn; a repeated ack
is idempotent; a `chat.turn` that fails before running still closes its turn
(the M12 stuck-turn bug); and a foreign runtime gets 404 without touching the
reply.

### ⚠️ The provider-env fix I shipped to `main` yesterday did not work

It has to be said plainly, because two green signals said otherwise.

A stray edit had mangled the registry query into `` `${root}\${path}` `` — in a
template literal `\$` escapes the `$`, so the argument became the literal
`HKCU${path}`. The HKLM path lost its separators the same way (`\C` and `\S`
are not escapes, so JS drops the backslash). **Both registry reads threw, both
returned `{}`, and every provider group fell through to the ambient fallback.**

Why nothing caught it:

- the unit tests passed, because they only ever exercised the fallback path;
- the manual check passed, because it used a **separate copy** of the parser in
  a scratch script rather than importing the module.

Two verifications, neither touching the broken line. The first real turn is what
found it, via the warning the fix itself emits: `provider credentials inherited
from this process rather than your saved settings: ANTHROPIC_BASE_URL`.

Now guarded three ways: two assertions on the source text (the bug is invisible
at runtime off Windows) and one Windows-only test that reads `HKCU\Environment`
and requires every provider key found there to resolve as `persistent`.

**Two existing tests had to be corrected rather than fixed**, and that is the
same lesson again: they planted `ANTHROPIC_API_KEY` in `process.env` and
asserted it was forwarded. That only passed because discovery was broken. With
it working, a machine with anthropic saved persistently drops ambient siblings —
which is the entire point. They now use a group the machine has not configured.

859 server tests pass; `pnpm typecheck` 9/9 and `pnpm test` 7/7.

### Still not ported

`/runs/:id/events`, `/runs/:id/status`, `/memory/*`, `/realtime/token`,
`/settings`, `/status`, `/projects/bindings`, `/providers/discover-models`,
`/chat/attachments/*`. The daemon logs a warning for the two it polls and
carries on, which is the intended degradation.
