# T-M3-04 — `sparstrow pair` CLI

| | |
|---|---|
| **Tag** | `[P]` parallel — own files |
| **Depends on** | T-M3-03 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

`sparstrow pair <code>` on a machine exchanges the code for a daemon token and
persists it. This is the only human step in pairing, so it has to be legible
when it goes wrong.

## Read this first: there is no `sparstrow` CLI

The plan writes `sparstrow pair <code>` as though the binary exists. It does
not. `packages/memory-cli` registers `sparstrow-memory`; nothing registers
`sparstrow`. This task creates the entrypoint.

## Decisions already made

**The CLI performs the exchange itself; it does not talk to a running core.**
Pairing must work before core is running and on a machine where core is
installed but stopped — that is the normal first-run state. Requiring a live
core would mean "start the daemon, then pair it, then restart it so it picks up
the token", which is three steps where there should be one.

Consequence: after a successful pair, a *running* core still has no token in
memory. The CLI prints that it must be restarted. T-M3-06 makes the heartbeat
loop re-read the store on failure, which softens this, but the honest message
is still "restart core".

**Bin lives in `packages/core`,** because the token, the secret store, and
`config.cloudUrl` all live there. A separate CLI package would have to duplicate
the secret-store path resolution, and two implementations of "where is the
encrypted store" is how they drift.

**Exit codes matter.** `0` paired, `1` bad/expired/consumed code, `2` cannot
reach the cloud. Anyone scripting a fleet rollout needs to distinguish "this
code was already used" from "the network is down".

## Checklist

- [ ] `packages/core/src/cli/pair.ts` + `bin` entry `sparstrow` in `packages/core/package.json`
- [ ] Build target matching `memory-cli`'s esbuild setup — check that package's `build` script and mirror it rather than inventing a second bundling approach
- [ ] `sparstrow pair <code>` — collects hostname, OS, `isElectron: false`, capabilities (T-M3-05's probe), core version
- [ ] Refuses to overwrite an existing token without `--force`, naming the currently paired workspace
- [ ] On success prints the runtime name and workspace, **never the token**, plus "restart core to connect"
- [ ] Distinct messages for: code not found / already used / expired / cloud unreachable
- [ ] `sparstrow pair --status` prints whether this machine is paired and to what
- [ ] `--help` that reads like documentation, since this is the first thing a new machine's owner runs

## Verification

- [ ] Pair a machine against staging with a real code; confirm one `runtimes`
      row appears in the UI
- [ ] Re-run the same code; assert exit `1` and a message saying it was consumed
- [ ] Run with `SPARSTROW_CLOUD_URL` pointing somewhere dead; assert exit `2`
      and a message about reachability, not a stack trace
- [ ] Run `pair` again on the paired machine without `--force`; assert refusal
- [ ] Confirm the token appears in the encrypted store and **not** in any log,
      terminal output, or shell history artefact

## On completion

- [ ] Tick 5.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
