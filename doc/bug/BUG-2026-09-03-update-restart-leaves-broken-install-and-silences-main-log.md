# BUG-2026-09-03-update-restart-leaves-broken-install-and-silences-main-log

**Status:** 🔴 open
**Reported by:** owner (app closed and never reopened after "install & restart"; reopened later to a "Failed" Settings screen), investigated by agent
**Reported:** 2026-09-03

## Symptom

The owner clicked "Install & restart" on a pending 0.3.3 update. The app
closed and did not reopen on its own. Reopening manually eventually landed on
Settings showing:

> Status: **Failed** — The server could not start.
> the server did not become healthy; see
> `C:\Users\gsrih\AppData\Roaming\Sparstrowgen\data\logs\server.log`

All four Supabase credential fields still showed "✓ Stored" — the stored
configuration was intact.

An agent (this session) then fully quit the app (File → Exit, confirmed zero
`Sparstrowgen.exe` processes and nothing on ports 8080/48750 afterward) and
relaunched it fresh. The **second** launch was worse: the window opened with
its native chrome (title "Sparstrowgen") but rendered a **permanently blank
black content area** — no nav bar, no Settings, nothing — for 30+ seconds,
with all four Electron processes reporting `Responding: True` and near-zero
CPU (i.e. not hung, just never loading/rendering the SPA).

## Reproduction

Not independently reproducible on demand (needs an update in flight). Evidence
from this one incident, reconstructed from three log files plus live process
inspection:

1. `C:\Users\gsrih\AppData\Roaming\Sparstrowgen\data\logs\core-service.log`
   and `...\data\logs\server.log` (the daemon and the API server's own logs)
   both stop cleanly around **16:29 local (20:29 UTC)** — no crash lines, just
   no further entries — roughly **11 minutes** after a normal healthy launch
   at 16:18 local. Nothing in `main.log` from this window suggests the owner
   quit the app; the main process kept running.
2. The owner's "install & restart" click happened later (their report; no
   direct timestamp). `main.log` shows the **installed files on disk** —
   everything under `C:\Users\gsrih\AppData\Local\Programs\Sparstrowgen\` —
   have `LastWriteTime` **20:40:50 local**, i.e. the update actually landed
   on disk around then.
3. `main.log` shows exactly two more entries after the last healthy session,
   both **only the first line the process ever logs** (`[log] main-process
   log: ...`) and nothing else — at 18:48:33 and 18:49:44 local, 71 seconds
   apart. This is the identical single-line-then-nothing signature already
   documented in
   [`BUG-2026-09-03-productName-not-name-decides-userdata`](BUG-2026-09-03-productName-not-name-decides-userdata.md)
   for a second-instance losing `requestSingleInstanceLock()` — consistent
   with the post-`quitAndInstall()` auto-relaunch (and/or the owner's own
   manual relaunch) racing the still-exiting previous process.
4. **`main.log` has written nothing at all since 18:49:44**, across every
   later launch — including the two this agent triggered directly (one
   `restart the server` no-op click, since the button is correctly disabled
   with no dirty fields; one full process-kill-and-relaunch, confirmed clean
   beforehand via `Get-Process` and `netstat`). `startFileLogging()`
   (`apps/desktop/src/main/log-file.ts`) unconditionally logs one line as its
   first action once it succeeds, and every later `console.log`/`console.warn`/
   `console.error` in the whole main process routes through it — so its total
   silence across multiple fresh, verifiably-single-instance launches means
   either the try block in `startFileLogging()` is throwing (silently, into
   its own `catch` — see Investigation) on every launch since, or something
   upstream of it in `main.ts`'s module-level synchronous setup is behaving
   differently post-update without crashing the process outright.
5. `server.log` and `core-service.log` have received **zero** new lines since
   16:29, including through both post-update launches above — i.e. neither
   `ServerManager.spawnServer()` nor `ServiceManager.spawnCore()` has visibly
   run since the update, in logs, even though the Settings UI explicitly
   showed `state: "failed"` with the message that only `ServerManager.start()`
   produces after its 60s health-check timeout (`server-manager.ts:148`) — a
   message that cannot appear without `spawnServer()` having been called and
   logged first.

## Investigation

Ruled out:
- **Not a file-permission/lock problem.** Directly wrote to
  `...\Sparstrowgen\data\logs\main.log` via PowerShell (`Add-Content`) while
  the app was running — succeeded immediately. ACLs show full control for the
  owning user.
- **Not a stuck/duplicate process holding the single-instance lock right
  now.** `Get-CimInstance Win32_Process` showed exactly one
  `Sparstrowgen.exe` tree (main + gpu + utility + renderer) both before and
  after the agent's clean relaunch.
- **Not disk space.** 83 GB free on `C:`.
- **Not the sibling "Sparstrowgen Dev" channel.** Its own, separate
  `main.log` under `...\Roaming\Sparstrowgen Dev\...` shows an unrelated,
  correctly-behaving dev-channel session from earlier the same evening
  (`no Supabase configuration stored — not starting`, as expected for that
  channel) — a red herring initially, ruled out by reading it directly.

Still open / suspected, not confirmed:
- `apps/desktop/src/main/updater.ts`'s `installNow()` only calls the injected
  `stopRuntimeForUpdate` — wired in `main.ts` to `services.stop(true)`
  (the daemon/core, port 48750) — **before** `autoUpdater.quitAndInstall(true,
  true)`. It never calls `apiServer.stop()` (the `server/` API child, port
  8080). `server-manager.ts`'s own comment on why that child is spawned
  **not** detached (lines 206–210) names this exact shape — "a survivor
  holding a port with credentials the new process could not reproduce" — as
  what broke updating in v0.3.1, but the fix only ensured the child *can* die
  with its parent, not that anything explicitly kills it during the one
  teardown path (`quitAndInstall`) that bypasses `main.ts`'s own `quitApp()`.
  In this specific incident `apiServer`'s child had already silently died on
  its own before the update (see Reproduction step 1), so it did not cause
  *this* run's failure — but the gap is real and would bite the next update
  that happens while the server is healthy.
- `log-file.ts`'s `startFileLogging()` calls `fs.createWriteStream(file,
  {flags:"a"})` and immediately treats it as ready (`currentPath = file`,
  proceeds to monkey-patch `console.*`) without attaching a `stream.on
  ("error", ...)` handler. `createWriteStream` returns synchronously before
  the underlying file descriptor is actually open; a transient failure to
  open (e.g. antivirus/Defender holding a freshly-installed directory's files
  briefly after an NSIS install) would surface as an **async** `'error'`
  event with no listener, which Node treats as fatal/uncaught rather than
  something the surrounding `try/catch` (which only guards the synchronous
  call) can see. This would explain silent, total, permanent logging loss for
  the rest of that process's life without crashing the process outright
  (nothing else in `main.ts` depends on the stream). **Not confirmed** — would
  need a repro with process-level diagnostics (e.g. `--enable-logging` /
  attaching to the main process) that this agent does not have access to on
  the owner's machine.
- The second (blank-window) failure is a distinct, and worse, symptom than
  the first (rendered Settings, server "Failed") — raised by an action *this
  agent* took (full quit + relaunch), on what should have been the exact same
  on-disk install as the owner's own last launch. That the freshly-installed
  files are all timestamped 20:40:50 local — after both of the 18:4x lock-loss
  attempts — means the *actual* file replacement on disk happened later than
  the owner's first restart attempt, i.e. there was a real gap between
  "clicked install & restart" and the files on disk actually changing that is
  not yet explained (electron-updater's own drain-wait in `beginInstall()`
  polls `/system/update-readiness` and refuses to install blind while core is
  unreachable — core's own log had already gone silent at 16:29, so this is a
  plausible but unconfirmed stall). Whether the on-disk install itself is
  incomplete/corrupted (a partially-written renderer bundle, given the silent
  install ran while core was already down) is the leading unconfirmed theory
  for the blank-window regression.

## Impact

The owner's desktop app was completely non-functional after a routine update
click, with no in-app path back to a working state — Settings' "Save and
restart the server" is correctly gated on having actually typed new
(real) credentials, so it cannot be used to just retry a start with the
existing stored ones. The user-visible failure mode ("closed and never
reopened") is exactly what the header of this repo's own AGENTS.md was
rewritten to call out: **the desktop app is the actual product**, and this
directly blocks using it. `main.log`'s total silence across the incident also
means a future occurrence of the same thing would be similarly hard to
diagnose from logs alone — the diagnostic tool the previous log-file.ts work
was built specifically to provide (see its own doc comment) did not deliver
during the one incident investigated here.

## Resolution

**Partially fixed** — two of the four items below landed in
[PR #227](https://github.com/sparstrow/sparstrowGen/pull/227)
(`claude/app-crash-update-1d416a`, commit `d85cb16`). Still 🔴 open overall:
neither fix has been verified against a real packaged build yet, and item 1
(the owner's own broken install) is unresolved until they reinstall from a
build that carries this fix.

1. **For the owner:** a clean reinstall is still needed to get a working app
   back today — the fix here prevents a *future* recurrence, it does not
   repair the currently-broken on-disk install. Best done once a build
   containing this fix is published, so the reinstall lands on the fixed
   version directly rather than needing to update again immediately after.
2. ✅ **Fixed.** `apiServer.stop()` is now part of the update-teardown path —
   `main.ts`'s `setRuntimeStopper` call stops both `services` and `apiServer`
   before `updater.ts` calls `quitAndInstall`.
3. ✅ **Fixed.** Both `log-file.ts`'s and `server-manager.ts`'s write streams
   now have an `'error'` listener that drops the stream reference instead of
   leaving an unhandled async `'error'` event to crash the process.
   `log-file.test.ts` reproduces the exact failure (a directory where
   `main.log` should be, forcing `EISDIR` on open) — confirmed to throw an
   uncaught exception against the pre-fix code, passes against the fix.
4. **Still open.** Why the actual file replacement on disk (20:40:50 local)
   came roughly two hours after the owner's first restart click (~18:48) is
   unconfirmed — `beginInstall()`'s drain-wait stalling against an
   already-unreachable core remains the leading theory, untested.
