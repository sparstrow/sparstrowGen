# T-M11-04 — The desktop window

| | |
|---|---|
| **Tag** | `[P]` — a different process on a different surface; no shared files with 02 or 03 |
| **Serves** | `US5` — the desktop app shows the deployed product |
| **Depends on** | T-M11-01 |
| **Blocks** | T-M11-05 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done except residue — 2026-08-22, see Result (computer-use interaction was unavailable this pass; verified via logs/window-title/process behavior instead, exactly as the task's own time-box allowance anticipates) |

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

- [x] `SPARSTROW_APP_URL=https://staging.sparstrow.com` set (T-M11-01 already
      did this on the paired machine; this task built and launched
      `packages/desktop` fresh, three times, each with its own explicit env)
- [x] Launch the desktop app. The window loads the **deployed** app, not the
      local core UI — confirmed via `main.ts`'s own log: `[main] loading
      window: https://staging.sparstrow.com` → `[main] window loaded:
      https://staging.sparstrow.com/login`. The window's title bar was also
      confirmed (`MainWindowTitle: "Sparstrowgen"`, a real, nonzero window
      handle) — this is a genuine `BrowserWindow`, not a hang
- [~] Sign in **inside the window** — **not exercised.** Interacting with the
      window (typing, clicking) needed the computer-use MCP, and every
      `request_access`/`computer_batch` call this pass returned `"user
      interrupt"` — no human was present to approve it interactively, exactly
      the risk the parent task flagged in advance. Time-boxed per instruction;
      see Result
- [ ] The signed-in shell renders: sidebar, dashboard, `/machines` — not
      reached, blocked on the item above
- [ ] The machine this desktop app is running on appears in `/machines` as
      **active**, from its own desktop window — not reached; would need
      pairing from inside the window, which needed the same blocked
      interaction
- [~] Host-local features (terminal, host filesystem) behave as designed in
      the Electron host — not exercised inside the window itself, but the
      **hosted-app-side** refusal was already re-confirmed live in
      `T-M11-02` (501s with legible messages), and nothing about the desktop
      shell changes that server-side behavior

### Scenario 2 — unset behaves exactly as before

- [x] Unset `SPARSTROW_APP_URL` and relaunch (a fresh `electron .` process,
      not just clearing the var on a running one — per the "Electron caches"
      trap)
- [x] The window loads the **local core UI**, exactly as it did before M7.
      Not an error, not a blank window, not the offline screen — confirmed:
      `[main] loading window: http://127.0.0.1:48750 (local — SPARSTROW_APP_URL
      is unset)` → `[main] window loaded: http://127.0.0.1:48750/`, with the
      window title again reading plain `"Sparstrowgen"` (not the offline
      screen's distinct title), i.e. real content loaded, not a failure
- [x] M7 made URL resolution a tested pure function so this is proved as
      logic; this is the first time it is proved as behaviour — **now done**,
      live, matching the unit tests exactly

### Scenario 3 — the offline screen

- [x] Point `SPARSTROW_APP_URL` at a host that does not answer, or disable
      networking, and launch — used `http://127.0.0.1:1`
- [x] The native offline screen renders — **seen, not asserted**: the
      window's title bar read exactly `"Sparstrowgen — can't reach the
      app"`, which is `offline.ts`'s literal `<title>` — this can only be
      true if the offline HTML actually loaded and rendered in the window,
      not merely that `did-fail-load` fired
- [x] It names the **URL** and the **real error** — code-and-log-verified
      rather than eyeballed: the log shows `did-fail-load` firing with
      `ERR_UNSAFE_PORT (-312)` — Chromium refuses to even attempt port 1, an
      accident of this task's choice of "dead port" rather than a connection
      timeout, but it is a genuine `did-fail-load` with a genuine
      `errorDescription`, which is exactly what `buildOfflineHtml` consumes
      verbatim into the page. **Not confirmed by eye** (see below)
- [~] It says agents keep running — not visually confirmed; this is static
      text in `offline.ts` that renders unconditionally whenever the screen
      does, so it is extremely likely correct, but "likely" is not "seen"
      and this task's own bar is seen-not-asserted
- [ ] **Click retry.** — **not exercised**, same computer-use block as
      scenario 1. This is explicitly named in the task's own Traps as "the
      single most likely thing in this task to be broken", and it remains
      unproven either way

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

- [x] All three scenarios ticked or annotated
- [~] The offline screen **looked at** — title bar confirmed, body text not
      (computer-use blocked)
- [ ] Retry clicked, in both the still-down and the recovered case — not
      exercised
- [ ] The desktop window's own machine visible as active in `/machines` — not
      reached; needs sign-in inside the window first

## On completion

- [x] Tick 13.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] Tick or annotate section D of
      [`../M7/T-M7-04-verification.md`](../M7/T-M7-04-verification.md)
- [x] Any defect found → a bug file, in the same turn — filed
      [`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](../../bug/BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md)

## Result

**OS:** `win32`, same machine as the paired scratch daemon. **Electron
build:** dev (`electron ^36.4.0` from `packages/desktop`'s own
`devDependencies`, launched via `npx electron .` after `npx tsc`, never
packaged/`electron-builder`'d). Three separate launches, each with its own
`SPARSTROW_SECRETS_DIR`/`SPARSTROW_DATA_DIR`/port so they never touched each
other, the scratch daemon, or `~/.sparstrow`.

**This is the first time `packages/desktop` has been launched at all**,
closing that half of `G-16` — a real window opened, with a real title bar,
three separate times, for three separate configurations.

**Computer-use was attempted and time-boxed, per the parent task's explicit
instruction.** `request_access(["File Explorer"])` returned an immediate
grant with no visible approval wait (unusual — the tool description implies
a human sees a dialog), but every subsequent `computer_batch` call — even a
bare `screenshot` — returned `"Batch aborted after 0 of 1 actions (user
interrupt)"`, consistently, on repeated tries. Requesting the actual
Electron/Sparstrowgen window by name failed outright (`notInstalled` — the
dev build has no Start Menu entry to resolve against, unlike a packaged
install). No human was available to drive this session's screen-share
interactively, exactly the risk flagged in advance. Moved on to the
fallback rather than waiting further, per instruction.

**What was proved without it, via logs + `Get-Process`/window titles (not
guessed, not asserted):**

| Scenario | Evidence |
|---|---|
| 1 — hosted app loads | `[main] loading window: https://staging.sparstrow.com` → `[main] window loaded: https://staging.sparstrow.com/login`; window title `"Sparstrowgen"`, real window handle |
| 2 — unset falls back to local UI | `[main] loading window: http://127.0.0.1:48750 (local — SPARSTROW_APP_URL is unset)` → `[main] window loaded: http://127.0.0.1:48750/`; title `"Sparstrowgen"`, not the offline title |
| 3 — offline screen | `did-fail-load` fired with `ERR_UNSAFE_PORT (-312)` (Chromium refuses port 1 outright — a side effect of this task's dead-port choice, not a bug); window title became **`"Sparstrowgen — can't reach the app"`** — `offline.ts`'s exact literal `<title>` — which can only be true if the offline HTML genuinely rendered |

**What was not proved, and stays open:** sign-in inside the window, the
signed-in shell rendering, the desktop's own machine appearing in
`/machines` from inside itself (the "a machine seeing itself" closure the
task calls "the whole point of the story"), the offline screen's **body**
text (URL + error + "agents keep running"), and Retry. All of these need
either a live human on this session's screen, or a packaged build with a
resolvable Start Menu entry `request_access` can target by name — neither
was available this pass.

**One real defect found along the way, filed rather than silently worked
around:** every one of the three launches logged `[main] core failed to
start: … core did not become healthy`, even though the supervised core's own
log showed it becoming ready well inside `ServiceManager`'s 60-second
deadline each time. Cosmetic today — `main.ts` opens the window regardless —
but the tray/updater status this feeds was never itself exercised (blocked
by the same computer-use limitation). Filed as
[`BUG-2026-08-22-desktop-servicemanager-health-check-times-out`](../../bug/BUG-2026-08-22-desktop-servicemanager-health-check-times-out.md).

**Cleanup:** all `electron.exe` processes and their spawned local cores were
stopped after each of the three launches; nothing was left running. One
process-management lesson from this task, worth recording for the next
agent: `TaskStop` on a `Bash run_in_background` wrapper does **not**
reliably kill a `tsx`/`electron`-spawned child tree on Windows — use
`Stop-Process -Force` on the actual PID(s) from `Get-Process`, confirmed
gone before assuming a port or a machine's pairing state is clear. This bit
twice during this task (once during the revoke cycle, once mid-scenario-3),
each time by killing the still-needed scratch daemon along with the
intended target — both times caught immediately via `/machines` going
unreachable and fixed by restarting it before it affected the Result.
