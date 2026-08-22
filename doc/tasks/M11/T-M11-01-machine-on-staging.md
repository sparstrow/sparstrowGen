# T-M11-01 — A machine on staging, and both states

| | |
|---|---|
| **Tag** | `[S]` — nothing else in the phase can start without this |
| **Serves** | `US1` (SC-003) and `US3` — the prerequisite for both |
| **Depends on** | the owner action in [README.md](README.md) |
| **Blocks** | T-M11-02, T-M11-03, T-M11-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-22 |

## The scenarios this satisfies

> **US1 scenario 5** — a running, reachable machine reads as active with its
> name, OS, hostname, core version and what it can run.
>
> **US1 scenario 6** — a machine that has stopped talking reads as
> **unreachable** with when it was last seen, and does not claim to know which
> of off / asleep / crashed / disconnected happened.

Plus **SC-003**: a machine's displayed state matches reality within a stated
window, for both states, verified by forcing each deliberately.

This also finishes the residue of
[`T-M3-08`](../M3/T-M3-08-verification.md) — M3 was verified against a local
control plane, never a deployed one.

## Objective

Pair a real machine to `staging.sparstrow.com` for the first time in this
project's life, confirm it registers correctly, and force both machine states.

## Procedure

Set on the machine that will run core, then restart it:

```
SPARSTROW_CLOUD_URL=https://staging.sparstrow.com
SPARSTROW_APP_URL=https://staging.sparstrow.com
```

`SPARSTROW_APP_URL` is for T-M11-04's desktop window; set both now so the
machine is not touched twice. Confirm with `sparstrow pair --status`, which
prints the control plane it will use.

## Checklist

- [x] Environment set and core restarted; `sparstrow pair --status` reports
      `Control plane https://staging.sparstrow.com`
- [x] Signed in to `staging.sparstrow.com` in a browser (Playwright MCP, per
      `agent-browser-session.md` — magic-link token minted for a disposable
      `m11-<ts>@sparstrow.test` account)
- [x] Pairing code generated **from `/machines`** (M8's page), not Settings
- [x] `sparstrow pair <code>` run on the machine → exit code 0
- [~] The machine appears in `/machines` **without a manual refresh** — not
      cleanly isolated in this pass: the row was always checked by navigating
      to `/machines` fresh (or re-fetching `/api/v1/system/health` directly),
      never by watching an already-open tab go from empty to populated with no
      navigation at all. Re-checked properly in T-M11-03, which re-pairs this
      same machine after revoking it and is a natural second chance to watch
      an already-open tab update live
- [x] Its row shows the real hostname (`DESKTOP-GJ8NLB8`), `os: win32`, the
      core version (`0.1.0`), and capability badges matching what is genuinely
      installed and authenticated on that machine — **not** the static provider
      registry. Badges showed `claude-code` and `antigravity`, matching
      `probeCapabilities()`'s live `--version` probe. **Caveat found in
      T-M11-02**: the badge only proves the binary runs, not that it can
      complete a real authenticated call — `claude-code`'s badge read `true`
      while its OAuth token was in fact expired on this machine, which only
      surfaced once a real run was dispatched. See T-M11-02's Result and the
      new `KnownGaps.md` entry
- [x] The row reads **active**
- [x] Stop core. Within 90 seconds the row reads **unreachable · last seen …**
      — forced by hard-killing the process (`Stop-Process -Force`); confirmed
      stale at 89–95s after the kill, `lastHeartbeat` on the row unchanged
      (not wiped) at the last real heartbeat
- [x] The word "unreachable" appears; the words "off", "asleep", "turned off"
      and "crashed" do not — row text verbatim: *"unreachable · last seen 1m
      ago · win32 · DESKTOP-GJ8NLB8 · core 0.1.0"*
- [x] Restart core; the row returns to **active** within one heartbeat interval
      (30s) — observed active again within ~7s of the process restart (core
      registers immediately at boot, ahead of the first heartbeat)
- [x] The pairing code panel retired itself when the machine appeared
- [x] Factory Health and `/api/v1/system/health` report the machine correctly
      against staging — `GET /api/v1/system/health` returned the runtime with
      correct `online`/`lastHeartbeat`/`capabilities` in both states

## Traps

**A daemon that was already running does not pick up the new environment.** It
reads config at startup. Restart it, and confirm with `--status` rather than
assuming the variable took.

**`sparstrow pair` on a machine that is already paired refuses by default.**
That is deliberate — a second run must not silently move a machine between
workspaces. Use `--force` knowingly, and note in the Result that you did.

**The 90-second window is `HEARTBEAT_STALE_AFTER_MS`, three heartbeat
intervals.** Do not shorten it. Do not conclude a failure at 60 seconds.

**Do not revoke or remove this machine.** T-M11-02 and T-M11-04 need it.
T-M11-03 revokes deliberately and re-pairs afterwards.

**Cold starts.** Vercel functions can be cold on the first request after a
quiet period, so the very first pairing attempt may be slow. Slow is not
broken; a timeout that persists across three attempts is.

## Verification

- [x] Both states observed, each forced deliberately, with the timings recorded
- [x] `sparstrow pair --status` output pasted into the Result, with the token
      absent (it is never printed — confirmed still true)
- [x] Screenshot of `/machines` in both states — the Playwright MCP browser
      **does** render in this environment (per `agent-browser-session.md`'s
      2026-08-20 update); the in-app Browser pane was not used at all this
      pass. Screenshots saved: `m11-01-active.png`, `m11-01-unreachable.png`,
      `m11-01-active-restored.png`

## On completion

- [x] Tick 13.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] Tick or annotate the corresponding assertions in
      [`../M3/T-M3-08-verification.md`](../M3/T-M3-08-verification.md) — that
      task was already fully complete from M3 (2026-08-10) against a
      different machine; T-M3-08 itself needs no further edits, its residue
      (a live pass against a *deployed* control plane) is exactly what this
      task supplies
- [x] Flip the runbook row for the owner action to done
- [x] Any defect found → a file in [`../../bug/`](../../bug/README.md), in the
      same turn — none found specific to this task; the capability-badge/auth
      gap surfaced only once T-M11-02 dispatched a real run, and is recorded
      there and in `KnownGaps.md`

## Result

**Machine:** a scratch daemon (`m11-scratch-machine`), not the owner's own —
paired with its own `SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR` under this
session's scratchpad, per the runbook's isolation rule. `win32`,
hostname `DESKTOP-GJ8NLB8`, core `0.1.0`.

**Sign-in:** magic-link token minted via the Supabase admin API for a
disposable `m11-<timestamp>@sparstrow.test` account, exchanged at
`/auth/confirm`, in a Playwright-driven browser (not the in-app Browser
pane — confirmed rendering, screenshots, and DOM reads all worked normally).

**Pairing:** code generated from `/machines`' "Pair a machine" panel
(`TJ7BC-K6DCR`, 10-minute TTL); redeemed with
`npx tsx src/cli/pair.ts <code> --name m11-scratch-machine` (no `--force`
needed — first pairing). `sparstrow pair --status` output:

```
Paired to workspace 2688c5a0-7f1e-46ca-852a-abfa0c4182b5
Runtime id          368bd77b-d2ce-4189-9173-ada937c6bf30
Control plane       https://staging.sparstrow.com
Name                m11-scratch-machine
Status              online (online)
```

No token in that output, nor anywhere else observed across pairing, status,
or the core log.

**Capability badges:** `["claude-code", "antigravity"]`, matching
`probeCapabilities()`'s live probe (both binaries genuinely present and
`--version`-able on this machine). Row text once active: *"active · win32 ·
DESKTOP-GJ8NLB8 · core 0.1.0"*.

**Both states, timed:**

| State | How forced | Result |
|---|---|---|
| active | pairing + core boot | row read `active` immediately on registration |
| unreachable | `Stop-Process -Force` on core's node process (a plain `TaskStop` on the backgrounding bash wrapper did **not** actually kill the underlying `tsx`-spawned node process — a harness quirk, not a product issue — the real kill needed a direct `Stop-Process`) | row read `unreachable · last seen 1m ago · …` at 89–95s after the real kill, matching `HEARTBEAT_STALE_AFTER_MS` (90s) exactly. `lastHeartbeat` on the row stayed at the last real beat rather than being cleared — correct, matches M3's "nothing writes to the row" assertion |
| active (restored) | core restarted, same env | row read `active` again within ~7s (re-registers at boot, ahead of the first 30s heartbeat) |

`/api/v1/system/health` reported the runtime correctly in every state,
including `onlineCount`/`totalCount` flipping to `0`/`1` while unreachable —
matches the UI.

**One caveat, not a defect in this task but load-bearing for the next one:**
the capability badge only reflects that a provider binary runs
(`healthCheck()` = `claude --version`), not that it can complete a real
authenticated model call. T-M11-02 found `claude-code`'s badge reading
`true` while its actual OAuth token was expired on this machine — see that
task's Result and the new `KnownGaps.md` entry. Recorded here because this
is the task whose checklist explicitly warned about exactly this shape of
problem.
