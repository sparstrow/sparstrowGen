# T-M7-02 — Electron loads the hosted app

| | |
|---|---|
| **Tag** | `[C]` concurrent — shares `main.ts` with T-M7-03; one worker at a time on that file |
| **Depends on** | — |
| **Blocks** | T-M7-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

`SPARSTROW_APP_URL` decides what the desktop window loads. Set, the window shows
the hosted product; unset, it falls back to exactly today's behaviour.

## Decisions already made

**The URL is configuration and the fallback must not lie — phase decision 6.**

```ts
const DEV = process.env.SPARSTROW_DEV === "1";
const LOCAL_UI_URL = DEV
  ? (process.env.SPARSTROW_UI_URL ?? "http://127.0.0.1:5173")
  : (process.env.SPARSTROW_CORE_URL ?? "http://127.0.0.1:48750");

/**
 * The hosted app, when there is one. Unset means load the local core's own UI —
 * today's behaviour, and a working product rather than a broken one.
 */
const APP_URL = process.env.SPARSTROW_APP_URL?.replace(/\/+$/, "") || LOCAL_UI_URL;
```

**There is no deployment yet, so there is no default to guess.** Do not put a
production hostname in that fallback. A default pointing at a domain nobody has
registered converts "not deployed yet" into "the desktop app fails with a DNS
error naming a host that does not exist". See the phase README's owner action.

**Only the WINDOW moves — phase decision: the tray and the updater must not.**
They reach the local core through `core-client.ts`, token-authed, and that is
correct: they manage this machine's daemon, not the product. Read every use of
the existing `UI_URL` before repurposing the name, and prefer renaming it to
`LOCAL_UI_URL` so a future reader cannot use the wrong one by reflex.

**The preload bridge survives and needs no change — phase decision 5.**
`contextBridge` attaches per window regardless of origin, so the native folder
picker and the updater keep working against a hosted page.
`nativePickerAvailable()` probes for the FUNCTION, so nothing degrades.

**Host-local features stay `501` in the window, and that is the architecture
arriving rather than a regression — phase decision 5.** A hosted HTTPS page
cannot call `http://127.0.0.1:48750`, and `webSecurity` must not be relaxed to
let it. The window talks to the cloud; the cloud talks to this machine's daemon.

## Checklist

- [ ] `SPARSTROW_APP_URL` read in `main.ts`, trailing slashes stripped, empty
      string treated as unset
- [ ] Falls back to the existing local URL when unset — a build with no new env
      var behaves exactly as it does today
- [ ] `UI_URL` renamed to `LOCAL_UI_URL`, with every other reference checked
- [ ] Tray and updater still resolve the LOCAL core, verified by reading
      `core-client.ts` and `tray.ts` rather than assumed
- [ ] The loaded URL is logged once at startup, so a support question is one log
      line rather than a guess
- [ ] `packages/desktop` typecheck and tests green
- [ ] A runbook entry in `doc/runbooks/` — deploying the web app, which env vars
      it needs, and setting `SPARSTROW_APP_URL` — and a row in
      [`../../runbooks/README.md`](../../runbooks/README.md)'s action list,
      because this is the phase's one owner-blocked item

## Traps

**Do not point the daemon's own `SPARSTROW_CLOUD_URL` at the same value blindly.**
They are the same host in practice once deployed, but they mean different things:
one is where this machine's daemon reports to, the other is what the window
displays. Conflating them into one variable makes a future split (a staging
window against a production daemon, or the reverse) a code change.

**A packaged build must not require the new variable.** `applyPackagedEnv()`
runs before anything else and a missing variable there must stay non-fatal —
the whole point of the fallback.

## Verification

- [ ] Unit/typecheck green
- [ ] A build with the variable unset starts and loads the local core; a build
      pointed at a real host loads it → **T-M7-04** (the second half needs a
      deployment that does not exist yet — see the phase README)

## On completion

- [ ] Tick 9.2 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
