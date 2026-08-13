# T-M7-03 — Electron offline and failure screen

| | |
|---|---|
| **Tag** | `[C]` concurrent — shares `main.ts` with T-M7-02; one worker at a time on that file |
| **Depends on** | — |
| **Blocks** | T-M7-04 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

A desktop window that cannot reach the app says so, natively, with a retry —
instead of sitting empty.

## Decisions already made

**`did-fail-load`, because `did-finish-load` cannot see this — phase decision 7.**
`main.ts` currently handles no failure at all: `void mainWindow.loadURL(UI_URL)`
with an unreachable host leaves a blank window and one unhandled rejection.

```ts
mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription, failedUrl, isMainFrame) => {
  // Sub-frame failures are not the window failing — an ad-blocked iframe or a
  // dead embed must not replace the whole product with an error screen.
  if (!isMainFrame) return;
  // -3 is ERR_ABORTED, which is what a navigation the user or the app itself
  // superseded looks like. It is not a failure to report.
  if (errorCode === -3) return;
  showOfflineScreen({ failedUrl, errorDescription });
});
```

**The screen is Electron-side, never a route in the app.** An offline screen
served by the thing that is offline is not an offline screen. `offline.ts`
builds the HTML and the window loads it from a `data:` URL (or a packaged file),
so it works with zero network and zero dependency on the app being up.

**Retry restores the window's real destination, so the screen must not become
the window's location in a way that loses it.** Keep the intended URL in a
variable owned by `main.ts`; retry calls `loadURL` on that, not on history.

**What it says matters more than how it looks.** The screen names the URL it
could not reach and the actual error, because the two failures behind it need
completely different actions from the user: the app being down is a wait, and a
misconfigured `SPARSTROW_APP_URL` is a settings fix. A screen that says only
"You're offline" sends someone to check their wifi for a typo in an environment
variable.

It should also say — plainly — that **agents keep running while this window is
down.** The daemon is a separate process and is unaffected; the tray is still
live. Someone whose window went white has no way to know that, and the wrong
guess is "my work stopped".

## Checklist

- [ ] `packages/desktop/src/offline.ts` — builds the screen's HTML, no network,
      no external assets, styled to match the app's dark background
      (`#0a0a0a`, already the window's `backgroundColor`)
- [ ] `did-fail-load` wired in `main.ts`, ignoring sub-frames and `ERR_ABORTED`
- [ ] The screen names the failed URL and the error description
- [ ] The screen states that the daemon keeps running and agents are unaffected
- [ ] A retry control that re-loads the intended URL
- [ ] The intended URL is held in `main.ts`, not recovered from window history
- [ ] Retry that fails again returns to the screen rather than a blank window —
      the second failure is the one a naive implementation drops
- [ ] `packages/desktop` typecheck and tests green

## Traps

**Do not auto-retry on a timer without a visible control.** A window that
silently reloads every few seconds against a host that is down looks identical
to a window that is frozen, and it makes the log unreadable. If a timer is
added, the screen must show that it is counting down.

**`did-fail-load` fires for sub-resources in some Electron versions.** The
`isMainFrame` guard is not optional; without it a single failed font request can
replace a working page with an error screen.

**The screen must not be able to load a stale copy of itself.** Build it fresh
per failure so the URL and error it names are the current ones — a cached screen
naming a previous failure is worse than no detail at all.

## Verification

- [ ] Unit/typecheck green
- [ ] Point a build at a dead port, confirm the screen, confirm retry recovers
      once the target is up → **T-M7-04**. This one is fully testable today: it
      needs an unreachable host, not a deployment.

## On completion

- [ ] Tick 9.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
