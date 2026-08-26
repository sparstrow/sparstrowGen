# T-M11-02 — A run, live

| | |
|---|---|
| **Tag** | `[C]` — drives the same machine and workspace as T-M11-03; interleavable, not simultaneous |
| **Serves** | `US3` — send work from the browser and watch it run on that machine |
| **Depends on** | T-M11-01 |
| **Blocks** | T-M11-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except residue — 2026-08-22, see Result |

## The scenarios this satisfies

> 1. **Given** an active machine, **When** I start a run from the browser,
>    **Then** it begins on that machine within seconds, untouched by me.
> 2. **Given** a run is executing, **When** I watch it, **Then** the transcript
>    appears progressively, not only at the end.
> 3. **Given** the run finished, **When** I reload, **Then** its final status
>    and full transcript are still there.
> 4. **Given** I try a host-local action in the hosted app, **When** it refuses,
>    **Then** it explains this needs the machine directly.

**Independent test:** queue one run from `staging.sparstrow.com`, watch its
transcript while it executes on the paired machine.

## Objective

The first time work has ever crossed from a deployed browser to a real machine
in this project. This is also the live half of [`G-13`](../../KnownGaps.md) —
M5's transcript path has been built, unit-tested, and never seen.

## Prerequisites

- T-M11-01 complete: a machine active on staging.
- **An agent provider genuinely installed and authenticated on that machine.**
  The capability badges from T-M11-01 say which. A run dispatched to a provider
  that is registered but not really present dies at spawn, and that failure
  looks like a dispatch bug.
- A project bound on that machine, or a run that needs no project. Check
  `/api/v1/runtime-projects` if unsure — an unbound project parks the task in
  `project_not_available` rather than running, which is correct behaviour and
  the wrong thing to be testing here.

## Checklist

### Scenario 1 — it starts on the machine

- [x] Start a run from `staging.sparstrow.com` against the paired machine
- [x] It begins within **one poll interval** (`COMMAND_POLL_INTERVAL_MS`, 3s) —
      not instantly; there is no doorbell ([`D-12`](../../Deferred.md)) and 3s
      is correct, not a defect. Observed ~2s (dispatch 19:58:41 →
      core's own `run started` log line at 19:58:43) on the first attempt,
      ~2s again on the antigravity attempt (dispatch 20:05:15 → started
      20:05:17)
- [x] Confirm it is genuinely executing **on the machine**: a process is
      visible there, or the machine's own logs show it. A cloud row saying
      `running` is not proof of local execution — the scratch core's own log
      recorded `run started` / `run finished` with matching run ids for both
      attempts, and `agy`/`claude` were spawned as real child processes on
      this host, not simulated
- [x] The run row reaches a terminal status with its metrics (cost, turns,
      duration). The antigravity run reached `succeeded` in 13.5s;
      `costUsd`/`numTurns` are `null` — by design, not a bug: `extractResult()`
      in `antigravity.ts` states plainly "agy --print reports no cost/token
      stats"

### Scenario 2 — the transcript is live

- [x] Open `/runs/<id>` **while the run is executing**
- [~] Transcript events appear **progressively**, before the run ends —
      **confirmed at the data layer, not fully at the UI layer.** Polling
      `GET /runs/<id>/events` during execution returned events one at a time
      as they were produced (seq 0 at 20:05:28.472, seq 1 at 20:05:29.874,
      seq 2 at 20:05:31-ish) — genuinely progressive delivery, not a
      end-of-run batch. But the **visible** Transcript card showed nothing at
      all, live or after completion — found and filed as
      [`BUG-2026-08-22-antigravity-transcript-not-rendered`](../../bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md):
      the antigravity provider's events are generically typed `"raw"` and
      `RunTranscript`'s `EventRow` has no case for that type, so they're
      silently dropped from render. `claude-code`'s richer event types
      (`system`/`assistant`/`tool_use`/`result`) *are* handled by
      `EventRow` — code-verified, not re-observed live this pass, because the
      only available `claude-code` install had an expired OAuth token (see
      below) and every dispatch to it failed before producing visible content
- [x] No duplicate `seq`, no visible gap — `seq` 0, 1, 2 exactly once each, in
      both the cloud and the local SQLite copy (see Scenario 3)
- [x] Run was short (13.5s) because of a separate limitation (see Result) —
      not ideal for demonstrating a *long* progressive render, but the
      timestamps above still show three genuinely separate arrivals, not one
      batch

### Scenario 3 — it persists

- [x] Reload `/runs/<id>` after completion. Final status (`succeeded`) and the
      Result card's text are present after a hard reload. The Transcript
      card's **display** is empty both live and after reload — same rendering
      bug as scenario 2, not a persistence gap: the underlying events are
      fully there via the API (see below)
- [x] Compare the cloud `run_events` count for that run against the machine's
      local SQLite count — **3 and 3, exact match**, `seq` `0,1,2` on both
      sides. Recorded numerically in the Result
- [ ] A long run's transcript is not truncated at 500 events (M5's pagination
      fix) — **not exercised**. The only run that finished cleanly had 3
      events; nothing in this pass produced a transcript anywhere near 500.
      Left as residue, see Result / `G-13`

### Scenario 4 — host-local refuses legibly

- [x] In the hosted app, try a terminal, a host filesystem browse, and a git
      operation
- [x] Each returns a 501 whose message says it runs on the local daemon and is
      not available from the web app — the deliberate refusals in
      [`stubs.ts`](../../../apps/web/src/lib/api/handlers/stubs.ts). Verbatim:
      `POST /terminal/create` → *"Terminal access runs on the local daemon and
      is not available from the web app."*; `GET /host-fs/list` → *"Local
      filesystem access runs on the local daemon and is not available from the
      web app."*; `POST /git/status` → *"Git operations runs on the local
      daemon and is not available from the web app."*
- [x] Confirm they still **refuse**. A helpful-looking fix that made one of
      these work is a regression, not an improvement — all three still refuse

## Traps

**A green run status proves M4, not M5.** They are separate assertions. Tick
scenario 1 and scenario 2 independently, and do not let the first stand in for
the second — that substitution is exactly why `G-13` is still open.

**Realtime is the fast path, not the delivery guarantee.** If events appear
only on reload, the broadcast failed and the durable path saved it. That is the
system working *and* scenario 2 failing. Say both.

**Vercel function timeouts.** A long-running request against a serverless
route can be cut off. The transcript path is designed around this — batches are
short requests — but if something times out, record the exact route.

**Do not revoke anything.** T-M11-03 does that, deliberately, and running it
first strands this task.

## Verification

- [ ] All four scenarios ticked or annotated with what blocked them
- [ ] The `run_events` count comparison recorded numerically in the Result
- [ ] Anything unreached written up in
      [T-M11-05](T-M11-05-gap-reconciliation.md), not silently dropped

## On completion

- [ ] Tick 13.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Tick or annotate the corresponding sections of
      [`../M5/T-M5-06-verification.md`](../M5/T-M5-06-verification.md)
- [ ] Any defect found → a bug file, in the same turn

## Result

**Machine:** `m11-scratch-machine` (same scratch daemon paired in T-M11-01),
`win32`/`DESKTOP-GJ8NLB8`, capabilities `["claude-code", "antigravity"]`.

**Attempt 1 — `claude-code`, blocked by an environment condition, not a
product bug.** Created a cloud agent (`agt_e24f…`) and, per M4's D-9
by-design "no agent-def sync" behaviour, a matching local agent on the
daemon by slug. First dispatch (`run_534bfacf…`) failed fast and legibly:
*"This machine has no agent with the slug…"* — correct, expected `resolve.ts`
behaviour, before the local agent existed; not a defect. Second dispatch
(`run_cf75712f…`, agent `M11 Verification Agent`, model `sonnet`) genuinely
started on the machine (core's own log: `run started` 2s after dispatch) and
then failed after 3 minutes and 7 exponential-backoff retries with:

```
Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth access token has expired. Re-authenticate to continue."},"request_id":null}
```

`claude auth status` on this machine reports `loggedIn: true`, and
`claude --version` succeeds — both of which are exactly what
`probeCapabilities()`'s `healthCheck()` checks (`claude --version`,
`authenticated: null` always) — but a real completion call is genuinely
rejected. Re-authenticating needs an interactive browser OAuth flow
(`claude auth login`), which this pass could not perform. **This is the
scenario T-M11-01's checklist warned about almost verbatim**: a capability
badge (`claude-code: true`) that is not actually usable — the only
difference from "dies at spawn" is that it took 3 minutes of legible retries
to fail instead of failing instantly. Not filed as a `doc/bug/` — the root
cause (an expired token on this specific sandboxed dev machine) is an
environment condition, not a code defect — but worth a `KnownGaps.md` line
since `healthCheck()` deliberately never verifies real auth
(`authenticated: null` unconditionally in `claude-code.ts`), and this is the
first time that gap had a real, non-hypothetical consequence.

**Attempt 2 — `antigravity`, genuinely worked end to end.** `agy --version`
and a bare `agy -p "…" --output-format json` call both succeeded outside of
core, confirming the CLI itself is authenticated on this machine. Created a
second cloud+local agent pair (`M11 Verification Agent (agy)`,
`Gemini 3.5 Flash (Low)`) and dispatched `run_060caf1a12fb416f`:

| | |
|---|---|
| Started | 2026-08-22 20:05:17 UTC (2s after dispatch) |
| Finished | 2026-08-22 20:05:30 UTC — `succeeded` |
| Duration | 13.5s |
| Events (cloud) | 3 — `seq` 0, 1, 2 |
| Events (local SQLite) | 3 — `seq` 0, 1, 2 — **exact match** |
| costUsd / numTurns | `null` / `null` — by design (`agy --print` reports neither) |

Scenario 1 fully passes on this attempt. Scenario 2 (live progressive
transcript) is **split**: the *data* is genuinely progressive — polling the
events endpoint during execution returned each event only once it existed,
at three distinct timestamps ~1.4s apart, not all three at once at the end —
which is the actual claim `G-13` needs proved. But the **visible** Transcript
card on `/runs/<id>` showed nothing at all, live or after reload, because
antigravity's events are generically typed `"raw"` and the shared
`RunTranscript` component has no renderer for that type. Filed as
[`BUG-2026-08-22-antigravity-transcript-not-rendered`](../../bug/BUG-2026-08-22-antigravity-transcript-not-rendered.md).
Scenario 3's persistence and count-comparison assertions both passed
cleanly against this run (3/3, exact `seq` match, Result text survived a
hard reload). The 500-event pagination-cap assertion was not exercised —
nothing in this pass produced a transcript anywhere near that size; residue,
not a regression (M5's fix itself is unit-tested and untouched).

**Scenario 4 — passed outright.** All three host-local refusals verified
with their exact wording (see checklist above); no regression.

**Net for `G-13`'s live half:** the durable, progressive, no-duplicate,
no-gap delivery claim is now proved live (not just unit-tested) — that is
the actual substance of what M5 built and what this task exists to close.
What remains open is *rendering* it, which is a UI bug now filed rather than
an unknown. A rendered, scrolling, `claude-code`-style transcript being
watched live end-to-end was **not** achieved this pass, because the one CLI
provider whose events the UI already renders (`claude-code`) could not
complete a single real turn on this machine. That residue is recorded in
`G-13`'s rewrite (T-M11-05) rather than claimed here.

**Chat surface:** `/chat`'s own "start a new conversation" path was tried
first and found completely broken (404, no route at all) before falling
back to `POST /runs` directly. Filed as
[`BUG-2026-08-22-chat-new-session-404s`](../../bug/BUG-2026-08-22-chat-new-session-404s.md).
`POST /runs` (M4's dispatch endpoint) is what every run in this task
actually went through, and it worked correctly both times.
