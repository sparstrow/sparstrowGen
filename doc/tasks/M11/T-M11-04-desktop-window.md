# T-M11-04 — The desktop window

| | |
|---|---|
| **Tag** | `[P]` — a different process on a different surface; no shared files with 02 or 03 |
| **Serves** | `US5` — the desktop app shows the deployed product |
| **Depends on** | T-M11-01 |
| **Blocks** | T-M11-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenarios this satisfies

> 1. **Given** the app URL is set, **When** I open the desktop app, **Then** it
>    loads the deployed app and I can sign in inside it.
> 2. **Given** it is unset, **When** I open the desktop app, **Then** it behaves
>    exactly as today — the local UI, not an error.
> 3. **Given** the app is unreachable, **When** I open it, **Then** I get a
>    screen naming the URL and the real error, saying agents keep running, with
>    a retry that works.

**Independent test:** launch the desktop app with the app URL set; sign in
inside the window.

## Objective

Open the Electron shell for the first time since M7 built it. Nothing in
[`packages/desktop`](../../../packages/desktop) has ever been launched — no
window opened, no `did-fail-load` fired for real, retry never clicked
([`G-16`](../../KnownGaps.md)).

This is section D of [`T-M7-04`](../M7/T-M7-04-verification.md), which has been
blocked on a deployment since 2026-08-13.

## Checklist

### Scenario 1 — the hosted app, in the window

- [ ] `SPARSTROW_APP_URL=https://staging.sparstrow.com` set (T-M11-01 already
      did this on the paired machine)
- [ ] Launch the desktop app. The window loads the **deployed** app, not the
      local core UI
- [ ] Sign in **inside the window** — the full auth flow, in Electron, not in a
      browser. Magic link or password; note which
- [ ] The signed-in shell renders: sidebar, dashboard, `/machines`
- [ ] The machine this desktop app is running on appears in `/machines` as
      **active**, from its own desktop window. That closure — a machine seeing
      itself — is the whole point of the story
- [ ] Host-local features (terminal, host filesystem) behave as designed in the
      Electron host. If the IPC bridge does not exist yet, they refuse legibly
      rather than hanging — record which happened

### Scenario 2 — unset behaves exactly as before

- [ ] Unset `SPARSTROW_APP_URL` and relaunch
- [ ] The window loads the **local core UI**, exactly as it did before M7. Not
      an error, not a blank window, not the offline screen
- [ ] M7 made URL resolution a tested pure function so this is proved as logic;
      this is the first time it is proved as behaviour

### Scenario 3 — the offline screen

- [ ] Point `SPARSTROW_APP_URL` at a host that does not answer, or disable
      networking, and launch
- [ ] The native offline screen renders — **seen**, not asserted. Its content
      is covered by 12 tests and has never been looked at
- [ ] It names the **URL** and the **real error**, not a generic message
- [ ] It says agents keep running
- [ ] **Click retry.** With the host still down, it fails again legibly. Restore
      the host, click retry, and the app loads. A retry button that has never
      been clicked is the single most likely thing in this task to be broken

## Traps

**Electron caches.** After changing `SPARSTROW_APP_URL`, fully quit the app —
not just close the window. A window reloaded from a stale main process reads
the old URL and produces a confusing result.

**Scenario 2 is a regression test, not a feature test.** "Unset behaves exactly
as before" is the assertion most likely to be waved through because it is
boring. It is also the one that protects every existing local install.

**Signing in inside Electron is not the same as signing in in a browser.**
Cookie handling, the magic-link callback and any OAuth popup all behave
differently in a `BrowserWindow`. If magic link opens a system browser and the
callback lands there instead of in the window, that is a real defect and a bug
file — not something to work around by signing in elsewhere first.

**Do not test this on a machine you need in a known state.** If the desktop app
is on the same machine as the paired core, quitting and relaunching it should
not disturb core — confirm that, and note it.

## Verification

- [ ] All three scenarios ticked or annotated
- [ ] The offline screen **looked at**, with what it said recorded
- [ ] Retry clicked, in both the still-down and the recovered case
- [ ] The desktop window's own machine visible as active in `/machines`

## On completion

- [ ] Tick 13.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Tick or annotate section D of
      [`../M7/T-M7-04-verification.md`](../M7/T-M7-04-verification.md)
- [ ] Any defect found → a bug file, in the same turn

## Result

<!-- Which OS, which Electron build, how sign-in went, what the offline screen
     actually said, and whether retry worked. -->
