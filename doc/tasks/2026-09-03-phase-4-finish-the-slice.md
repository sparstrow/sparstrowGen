# Phase 4 remainder — make an agent reply

**Plan:** [`2026-09-02-multica-architecture-restructure.md`](../plans/2026-09-02-multica-architecture-restructure.md) §Phase 4
**Branch:** `claude/multica-app-architecture-0a3e6f`
**Status:** 4a done. 4b–4d not started.

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

_Pending 4b–4d._
