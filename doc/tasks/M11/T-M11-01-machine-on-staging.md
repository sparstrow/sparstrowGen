# T-M11-01 — A machine on staging, and both states

| | |
|---|---|
| **Tag** | `[S]` — nothing else in the phase can start without this |
| **Serves** | `US1` (SC-003) and `US3` — the prerequisite for both |
| **Depends on** | the owner action in [README.md](README.md) |
| **Blocks** | T-M11-02, T-M11-03, T-M11-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started — blocked on the owner action |

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

- [ ] Environment set and core restarted; `sparstrow pair --status` reports
      `Control plane https://staging.sparstrow.com`
- [ ] Signed in to `staging.sparstrow.com` in a browser
- [ ] Pairing code generated **from `/machines`** (M8's page), not Settings
- [ ] `sparstrow pair <code>` run on the machine → exit code 0
- [ ] The machine appears in `/machines` **without a manual refresh**
- [ ] Its row shows the real hostname, `os: win32` (or the actual platform),
      the core version, and capability badges matching what is genuinely
      installed and authenticated on that machine — **not** the static provider
      registry. A capability claimed here that is not really there becomes a
      run that dies at spawn (M3's own warning in `RuntimeIdentity`)
- [ ] The row reads **active**
- [ ] Stop core. Within 90 seconds the row reads **unreachable · last seen …**
- [ ] The word "unreachable" appears; the words "off", "asleep", "turned off"
      and "crashed" do not
- [ ] Restart core; the row returns to **active** within one heartbeat interval
      (30s)
- [ ] The pairing code panel retired itself when the machine appeared
- [ ] Factory Health and `/api/v1/system/health` report the machine correctly
      against staging

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

- [ ] Both states observed, each forced deliberately, with the timings recorded
- [ ] `sparstrow pair --status` output pasted into the Result, with the token
      absent (it is never printed — confirm that is still true)
- [ ] Screenshot of `/machines` in both states if the browser pane renders;
      if it does not, say so and record it, per
      [T-M11-05](T-M11-05-gap-reconciliation.md)

## On completion

- [ ] Tick 13.1 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Tick or annotate the corresponding assertions in
      [`../M3/T-M3-08-verification.md`](../M3/T-M3-08-verification.md)
- [ ] Flip the runbook row for the owner action to done
- [ ] Any defect found → a file in [`../../bug/`](../../bug/README.md), in the
      same turn

## Result

<!-- Which machine, which OS, the exact timings observed, the capability list
     reported, and whether it matched reality. -->
