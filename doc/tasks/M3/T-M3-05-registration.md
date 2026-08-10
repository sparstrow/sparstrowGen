# T-M3-05 — Registration + capability probe

| | |
|---|---|
| **Tag** | `[P]` parallel — own files |
| **Depends on** | T-M3-03 |
| **Blocks** | T-M3-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

## Objective

Tell the cloud what this machine is and what it can actually run, on every boot.

## The trap this task exists to avoid

`listProviders()` in `packages/core/src/providers/index.ts` returns the static
registry:

```ts
export function listProviders(): ModelProvider[] {
  return [...registry.values()];
}
```

That is every provider **the build knows about**, not every provider **this
machine can run**. It returns Claude Code on a machine with no `claude` binary
and Antigravity on a machine that has never installed `agy`.

Registering that verbatim is not a cosmetic bug. `runtimes.capabilities` is what
M4 routes dispatch on — a machine that claims a provider it does not have will
be handed work it cannot start, and the failure surfaces one layer away from its
cause, as a run that dies on spawn.

**Probe availability.** For CLI providers that means checking the binary
resolves and is executable at `config.claudePath` / `config.antigravityPath`.
For direct-API providers it means checking a key is present in the secret store.
Report only what passes.

## Decisions already made

**Registration runs at every boot, not only at pairing.** Capabilities change —
someone installs a CLI, adds an API key, upgrades core. A register-once model
means the cloud's picture is accurate exactly once and drifts thereafter.

**Registration is idempotent and keyed on the authenticated runtime id.** The
route derives that id from the bearer token (T-M3-02), so registration cannot
retarget another machine even if the payload tries.

**`name` defaults to the hostname but is owner-editable in the UI.** Machines
get renamed to things like "desk" and "laptop"; re-registering must not stomp a
name the owner chose. Registration updates `hostname`/`os`/`capabilities`/
`coreVersion` but leaves `name` alone once set.

**A probe must not hang boot.** Each check gets a short timeout and a failure is
"not available", not an exception. A dead network drive holding a configured
binary path must not wedge startup — this is the same class of failure the
existing startup watchdog in `packages/core/src/index.ts` was added to catch.

## Checklist

- [ ] `packages/core/src/cloud/registration.ts`
- [ ] `probeCapabilities(): Promise<string[]>` — CLI binaries resolved + executable, direct-API providers keyed
- [ ] Per-probe timeout; failures degrade to absent, never throw
- [ ] `register()` — hostname (`os.hostname()`), platform (`process.platform`), `isElectron` (detect via the same signal `packages/desktop` uses — check how it spawns core rather than guessing), `coreVersion` from `package.json`
- [ ] Called from core boot when `isPaired()`, alongside the existing `start*` calls in `index.ts`
- [ ] Never throws into the startup path — a failed registration logs and continues
- [ ] Unit tests: probe with binaries present, absent, and timing out; `register()` payload shape

## Verification

- [ ] On a machine with `claude` installed and `agy` absent, capabilities
      contain the former and not the latter — check the row in staging, not the
      local log
- [ ] Rename the runtime in the UI, restart core, confirm the name survives
- [ ] Point `config.claudePath` at a nonexistent file; confirm boot still
      completes and capabilities simply omit it
- [ ] `pnpm -F @sparstrow/core vitest run src/cloud`

## On completion

- [ ] Tick 5.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
