# BUG-2026-09-03 — Two desktop installs fight over the daemon port, and the second one shows no window for a minute

**Status:** 🟢 **Fixed 2026-09-03** in the same change that added the `dev`
channel. The per-install port this file called "the real fix" is built:
`apps/desktop/src/main/ports.ts`. `G-65` is closed with it.
**Found:** 2026-09-03, while verifying the Settings/update screen against a
running app.
**Severity:** High for the owner's very next action — installing the 0.3.0
stable build on a machine that already has **Sparstrowgen Staging** installed.

## What happened

A locally built desktop app was launched. It showed **no window at all**, for
about a minute, then opened normally with nothing on screen explaining the
delay. The log said:

```
[service] spawned core pid=45540 (detached)
[service] core exited code=1
... five more times ...
[service] too many core crashes — giving up
```

## Root cause

Three things compounding:

1. **The daemon port is a single hardcoded constant.**
   `packages/shared/src/constants.ts` — `DEFAULT_PORT = 48750` — with no
   per-channel or per-install variation. Every Sparstrowgen on a machine wants
   that one port.
2. **Two installs can never adopt each other's runtime.** `ServiceManager.start()`
   *does* handle "a core is already listening" by adopting it — but adoption
   goes through `probeHealth`, which authenticates with the **per-install**
   `.api-token` from that install's own data directory. A second install has a
   different token, so the probe gets 401, which is indistinguishable from
   "nothing is there". It concluded nothing was listening and tried to spawn.
3. **The window was blocked behind all of it.** `main.ts` did
   `await services.start()` before `openWindow()`, and `start()` polls for up to
   60 seconds before giving up. So a runtime problem presented as the whole
   application failing to launch.

The port was held by
`C:\Users\gsrih\AppData\Local\Programs\Sparstrowgen Staging\resources\node-runtime\node.exe`
— the daemon of an **installed** app, not a stray dev process. This is the
ordinary state of the owner's machine, not a test artefact.

## Why it had never been seen

Only one Sparstrowgen has ever been installed and run at a time. The staging
channel and the stable channel were built to coexist as *installs* (distinct
`appId`, `productName`, and — after
[BUG-2026-08-30](BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md) —
distinct `userData`), and every one of those separations was verified. The
runtime port was not one of the things separated, and nothing ran both at once
to find out.

## Fixed in this change

- **`ServiceManager.start()` checks whether the port is occupied before
  spawning** (`portInUse`, a raw TCP connect — the question is "will `listen()`
  fail", which the socket layer answers regardless of what holds the port). If
  something is there that we cannot talk to, it fails immediately with a
  sentence naming the likely cause, instead of crash-looping into EADDRINUSE.
- **`main.ts` no longer awaits the runtime before opening the window.** The
  window renders sign-in, Settings and its own "the server is not running" state
  without a runtime, so the runtime now starts alongside it. Window time on a
  port conflict went from ~60 s to under 10 s.

## NOT fixed

**Two Sparstrowgen installs still cannot both run their runtimes.** The second
one now says so clearly instead of hanging, but it has no runtime, so that
machine cannot execute agent work from the second app.

**For the owner, before installing 0.3.0: uninstall "Sparstrowgen Staging"
first.** The staging channel was retired with the `staging` branch on
2026-09-02, it will never receive another release, and leaving it installed
means whichever app starts second has no runtime.

The real fix is a per-install port — derived from the channel, or negotiated and
written to a file the way the API token already is. Deferred rather than done
here because it touches the daemon, `core-client`, `memory-cli`, `memory-mcp`
and the packaged resources, and doing it inside a release change would put an
untested port negotiation into the first build the owner installs.

## Fixed, 2026-09-03

Derived from the channel, as this file predicted. `apps/desktop/src/main/ports.ts`
holds the table:

| channel | core | server |
|---|---|---|
| `stable` | 48750 | 8080 |
| `dev` | 48850 | 8180 |

`prepare-resources.mjs` bakes both numbers into each install's own
`channel.json`, so the separation lives in the install rather than in a
machine-wide env var that one installer could rewrite for the other.

**One thing this cost that is worth remembering.** The obvious implementation —
have `packaged-env.ts` set `SPARSTROW_CORE_URL` from the channel — cannot work,
and would have failed silently. `core-client.ts` and `service-manager.ts` each
held `const CORE_URL = process.env.SPARSTROW_CORE_URL ?? "…48750"` at module
scope, and `main.ts` imports both on lines 3 and 6 while calling
`applyPackagedEnv()` on line 52. The constants were captured before the env var
was ever written. Every URL in that path is now a function for this reason, and
`ports.test.ts` asserts that a `setPorts` after import is actually observed.

**Why this became urgent.** The mitigation above said "uninstall Sparstrowgen
Staging first", which treats the collision as a leftover to tidy. It is not: the
owner's machine is *supposed* to hold two installs — the app they use, and the
one an agent builds to test with. Without separate ports the second app adopts
the first one's server (adoption succeeds when both are the same build and share
a token shape) and silently operates on the other install's data. That is worse
than the crash-loop this file was originally about, because nothing reports it.
