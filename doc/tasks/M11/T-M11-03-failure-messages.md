# T-M11-03 — The four failure messages

| | |
|---|---|
| **Tag** | `[C]` — drives the same machine as T-M11-02; interleavable, not simultaneous. **Run it after 02** — it revokes a token |
| **Serves** | `US4` — I can tell which thing is wrong: the code, the network, or the machine |
| **Depends on** | T-M11-01 |
| **Blocks** | T-M11-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] With the machine paired and active, press **Revoke** on `/machines`
- [ ] The confirm dialog explained revoke vs remove before you confirmed
- [ ] The machine's next request fails — watch its logs, or wait for the
      heartbeat to be rejected
- [ ] `sparstrow pair --status` on that machine prints the **revoked** message
      and tells you to run `sparstrow pair <code> --force`
      ([`pair.ts:87`](../../../packages/core/src/cli/pair.ts:87))
- [ ] Exit code is 1 (`EXIT_REJECTED`), not 2
- [ ] The machine still appears in `/machines` — revoke keeps the row, which is
      what the dialog said it would do
- [ ] Re-pair with a fresh code and `--force`; the machine returns to active

### 2 — Control plane unreachable

- [ ] Point the machine at a URL that does not answer (an unused localhost port
      is enough — `SPARSTROW_CLOUD_URL=http://127.0.0.1:1` — and does not
      require breaking the network)
- [ ] `sparstrow pair --status` says the control plane could not be reached
      **and names the URL** ([`pair.ts:92`](../../../packages/core/src/cli/pair.ts:92))
- [ ] Exit code is 2 (`EXIT_UNREACHABLE`), distinct from a rejected code
- [ ] `sparstrow pair <code>` against the same dead URL gives the same class of
      message — not "your code was wrong"
- [ ] Restore the staging URL and confirm the machine recovers

### 3 — Code already used

- [ ] Generate a code, redeem it on the machine
- [ ] Try to redeem the **same** code again (`--force` to get past the
      already-paired refusal)
- [ ] The message says specifically that the code was **already used** — not
      "invalid", not "unknown". This maps to `code_already_used` / SQLSTATE
      SPG02
- [ ] Exit code 1

### 4 — Code expired

- [ ] Generate a code and leave the panel open for its full 10-minute TTL
      (`CODE_TTL_MS`)
- [ ] At zero, the panel says the code has expired and **stops offering it** —
      the panel retires itself and the Pair button returns
- [ ] Redeeming the expired code on the machine reports **expired**
      specifically (`code_expired` / SPG03), not "unknown code"
- [ ] Exit code 1

### FR-013, checked as a whole

- [ ] The four messages are genuinely different from each other. Read them side
      by side. If two of them would lead an owner to the same wrong next action,
      that is the defect this task is looking for

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

- [ ] All four failures forced, all four messages recorded **verbatim** in the
      Result — the point of this task is the wording, so paraphrasing it defeats
      it
- [ ] All four exit codes confirmed
- [ ] The machine is back to active at the end

## On completion

- [ ] Tick 13.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Any message that names the wrong cause → a bug file, in the same turn
- [ ] Any token leak → a file in [`../../security/`](../../security/README.md)

## Result

<!-- The four messages, verbatim, with their exit codes. -->
