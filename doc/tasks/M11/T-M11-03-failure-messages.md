# T-M11-03 — The four failure messages

| | |
|---|---|
| **Tag** | `[C]` — drives the same machine as T-M11-02; interleavable, not simultaneous. **Run it after 02** — it revokes a token |
| **Serves** | `US4` — I can tell which thing is wrong: the code, the network, or the machine |
| **Depends on** | T-M11-01 |
| **Blocks** | T-M11-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — 2026-08-22 |

## The scenarios this satisfies

> 1. **Given** a paired machine, **When** I revoke it, **Then** its next request
>    fails and its own status command says *revoked* and how to reconnect.
> 2. **Given** a machine pointed at an unreachable URL, **When** I run pairing
>    or status, **Then** it says the control plane was unreachable and names the
>    URL — distinct from "your code was wrong".
> 3. **Given** a code already redeemed, **When** I reuse it, **Then** I am told
>    it was already used, specifically.
> 4. **Given** a code that expired, **When** I look at the panel, **Then** it
>    says so and stops offering a dead code.

**Independent test:** force each failure in turn; confirm each message names its
actual cause.

## Objective

Four deliberate failures, four distinct messages. This is FR-013 — the system
must distinguish, *in what it tells the owner*, a rejected code from an
unreachable control plane from a machine not running.

Every one of these is solo-doable and none needs a second machine. There is no
excuse for deferring this task.

## Checklist

### 1 — Revoked

- [x] With the machine paired and active, press **Revoke** on `/machines`
- [x] The confirm dialog explained revoke vs remove before you confirmed —
      verbatim: *"This machine stops reaching the workspace on its very next
      request. It stays in the list, and pairing it again with a fresh code
      restores access."*
- [x] The machine's next request fails — watch its logs, or wait for the
      heartbeat to be rejected — core's own log, within seconds:
      *"this machine's pairing was revoked — stopping heartbeat"* and
      *"…stopping the command loop"*, each logged exactly once
- [x] `sparstrow pair --status` on that machine prints the **revoked** message
      and tells you to run `sparstrow pair <code> --force`
      ([`pair.ts:87`](../../../packages/core/src/cli/pair.ts:87))
- [x] Exit code is 1 (`EXIT_REJECTED`), not 2
- [x] The machine still appears in `/machines` — revoke keeps the row, which is
      what the dialog said it would do
- [x] Re-pair with a fresh code and `--force`; the machine returns to active —
      note: a fresh code produces a **new runtime row** rather than reviving
      the old one (each pairing token is its own runtime identity), so the
      old revoked row was left behind as a dead duplicate and cleaned up with
      **Remove** afterward — not a defect, just worth knowing before doing
      this cycle on a real workspace

### 2 — Control plane unreachable

- [x] Point the machine at a URL that does not answer (an unused localhost port
      is enough — `SPARSTROW_CLOUD_URL=http://127.0.0.1:1` — and does not
      require breaking the network)
- [x] `sparstrow pair --status` says the control plane could not be reached
      **and names the URL** ([`pair.ts:92`](../../../packages/core/src/cli/pair.ts:92)) —
      verbatim: *"Could not reach the control plane at http://127.0.0.1:1."*
- [x] Exit code is 2 (`EXIT_UNREACHABLE`), distinct from a rejected code
- [x] `sparstrow pair <code>` against the same dead URL gives the same class of
      message — not "your code was wrong" — verbatim: *"Could not reach the
      control plane at http://127.0.0.1:1: fetch failed"*, exit code 2
- [x] Restore the staging URL and confirm the machine recovers — re-paired
      cleanly with a fresh code immediately after

### 3 — Code already used

- [x] Generate a code, redeem it on the machine
- [x] Try to redeem the **same** code again (`--force` to get past the
      already-paired refusal)
- [x] The message says specifically that the code was **already used** — not
      "invalid", not "unknown". This maps to `code_already_used` / SQLSTATE
      SPG02 — verbatim: *"That pairing code has already been used. Generate a
      fresh one — each code pairs exactly one machine."*
- [x] Exit code 1

### 4 — Code expired

- [x] Generate a code and leave the panel open for its full 10-minute TTL
      (`CODE_TTL_MS`)
- [x] At zero, the panel says the code has expired and **stops offering it** —
      the panel retires itself and the Pair button returns
- [x] Redeeming the expired code on the machine reports **expired**
      specifically (`code_expired` / SPG03), not "unknown code"
- [x] Exit code 1

### FR-013, checked as a whole

- [x] The four messages are genuinely different from each other. Read them side
      by side. If two of them would lead an owner to the same wrong next action,
      that is the defect this task is looking for — all four read distinctly
      and each names a different next action (re-pair with `--force`; check
      the URL/network; generate a fresh code; generate a fresh code). No
      defect found here

## Traps

**Run this after T-M11-02.** Revoking strands the run task.

**A dead localhost port is a better test than cutting the network.** It is
non-disruptive, instant, reversible, and exercises the same code path. The
genuine 60-second network cut belongs to `G-13` and is the owner's call
(phase decision 4).

**The token must never be printed.** `pair.ts` is deliberate about this. While
you are reading its output for four failures, confirm no path prints the token
— that is a security assertion riding along for free, and a leak found here
goes to [`../../security/`](../../security/README.md), not `bug/`.

**Waiting out a 10-minute expiry is boring and gets skipped.** It is also
scenario 4. Start the timer, do something else, come back. Do not shorten
`CODE_TTL_MS`.

**Restore the machine afterwards.** Re-paired, pointed at staging, active.
T-M11-04 needs it.

## Verification

- [x] All four failures forced, all four messages recorded **verbatim** in the
      Result — the point of this task is the wording, so paraphrasing it defeats
      it
- [x] All four exit codes confirmed
- [x] The machine is back to active at the end

## On completion

- [x] Tick 13.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] Any message that names the wrong cause → a bug file, in the same turn —
      none did; all four messages were accurate and distinct
- [x] Any token leak → a file in [`../../security/`](../../security/README.md) —
      none found; the token never appeared in any CLI output or core log across
      pairing, `--status`, revoke, unreachable, already-used, or expired

## Result

All four failure messages, verbatim, with exit codes:

| # | Trigger | Message | Exit code |
|---|---|---|---|
| 1 | Revoked (pressed Revoke on `/machines`, then `pair --status`) | *"This pairing has been REVOKED. Run `sparstrow pair <code> --force` to reconnect."* | 1 (`EXIT_REJECTED`) |
| 2 | Control plane unreachable (`SPARSTROW_CLOUD_URL=http://127.0.0.1:1`) | *"Could not reach the control plane at http://127.0.0.1:1."* (`--status`) / *"Could not reach the control plane at http://127.0.0.1:1: fetch failed"* (`pair <code>`) | 2 (`EXIT_UNREACHABLE`) |
| 3 | Code already used (redeemed once, then redeemed again with `--force`) | *"That pairing code has already been used. Generate a fresh one — each code pairs exactly one machine."* | 1 (`EXIT_REJECTED`) |
| 4 | Code expired (left the full 10-minute `CODE_TTL_MS`, then redeemed) | *"That pairing code has expired. Generate a fresh one and use it within 10 minutes."* | 1 (`EXIT_REJECTED`) |

All four are genuinely distinct in wording and each names a different concrete
next action. No defect found — FR-013 holds.

**Machine's own logs, revocation:** *"this machine's pairing was revoked —
stopping heartbeat. Run `sparstrow pair <code>` to reconnect."* and
*"…stopping the command loop…"*, each logged exactly once when the running
daemon's next heartbeat/poll was rejected — matching T-M3-08's prior
assertion that the loop stops and says so once, now reconfirmed live against
staging.

**Token:** never printed, anywhere, across all four cases — confirmed by
reading every CLI stdout/stderr line and the core log.

**One operational note, not a defect:** re-pairing after a revoke with a
*fresh* code creates a **new runtime row** rather than reviving the revoked
one (each pairing token is its own runtime identity in the schema). The old
revoked row was left behind as an inert duplicate and cleaned up with
**Remove**. Worth knowing before running this exact cycle against a real
workspace, but matches the system's actual model (a runtime *is* a token,
not a machine identity) rather than being wrong.

**Machine restored:** re-paired with a fresh code and `--force`, core
restarted, confirmed **active** in `/machines` before moving to T-M11-04.
