# T-M3-04 — `sparstrow pair` CLI

| | |
|---|---|
| **Tag** | `[P]` parallel — own files |
| **Depends on** | T-M3-03 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-10 |

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

- [x] `packages/core/src/cli/pair.ts` + `bin` entry `sparstrow` in `packages/core/package.json`
- [x] Build target matching `memory-cli`'s esbuild setup — check that package's `build` script and mirror it rather than inventing a second bundling approach
- [x] `sparstrow pair <code>` — collects hostname, OS, `isElectron: false`, capabilities (T-M3-05's probe), core version
- [x] Refuses to overwrite an existing token without `--force`, naming the currently paired workspace
- [x] On success prints the runtime name and workspace, **never the token**, plus "restart core to connect"
- [x] Distinct messages for: code not found / already used / expired / cloud unreachable
- [x] `sparstrow pair --status` prints whether this machine is paired and to what
- [x] `--help` that reads like documentation, since this is the first thing a new machine's owner runs

## Verification

- [x] Pair a machine against staging with a real code; confirm one `runtimes`
      row appears in the UI
- [x] Re-run the same code; assert exit `1` and a message saying it was consumed
- [x] Run with `SPARSTROW_CLOUD_URL` pointing somewhere dead; assert exit `2`
      and a message about reachability, not a stack trace
- [x] Run `pair` again on the paired machine without `--force`; assert refusal
- [x] Confirm the token appears in the encrypted store and **not** in any log,
      terminal output, or shell history artefact

## On completion

- [x] Tick 5.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-10

31 assertions against the real binary, the running dev server and live staging
(`scratchpad/pair-cli.mjs`), with `SPARSTROW_SECRETS_DIR` pointed at a throwaway
directory so the developer's own pairing was never touched.

Exit codes behave as specified: `0` paired, `1` code rejected (used / expired /
typo, each with its own message), `2` control plane unreachable — and that last
one carries no stack trace, just the URL and the cause.

Also confirmed: the encrypted store contains the key name but no readable
token, the token appears nowhere in CLI output, re-pairing without `--force` is
refused *without burning the new code*, and `--unpair` says plainly that it does
**not** revoke the token in the cloud.

### Found while building

**The CLI could not be bundled as CJS.** `config.ts` resolves `repoRoot` from
`import.meta.url`, which esbuild cannot represent in a CJS bundle — it compiles
to `undefined` and the binary dies inside `fileURLToPath` before `main()` runs.
`memory-cli` gets away with `--format=cjs` only because it never touches
`import.meta`. Built as ESM (`dist/cli/pair.mjs`) instead.

Two follow-on traps in that same build line, both caught by running the binary
rather than by the build succeeding:

- `--packages=external` externalises the workspace packages too, and their TS
  sources are not resolvable at runtime. Only the native addons may be external.
- esbuild preserves a source shebang, so adding `--banner:js` produced two
  shebang lines — and the second is a syntax error, not a comment.
