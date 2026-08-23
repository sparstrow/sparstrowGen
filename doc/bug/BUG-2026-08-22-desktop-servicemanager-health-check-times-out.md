# BUG-2026-08-22-desktop-servicemanager-health-check-times-out

**Status:** 🟢 resolved
**Reported by:** agent — found during T-M11-04 (M11 live verification, first-ever launch of the Electron desktop shell), launching `packages/desktop` three separate times against `staging.sparstrow.com`
**Reported:** 2026-08-22

## Symptom

Every one of three separate `electron .` launches (dev build, `SPARSTROW_APP_URL`
set to staging, unset, and set to a dead port respectively) logged, to stdout:

```
[main] core failed to start: Error: core did not become healthy; see <repoRoot>\data\logs\core-service.log
    at ServiceManager.start (...\service-manager.js:87:15)
    at async ...\main.js:53:13
```

— even though the supervised core's **own log**, at `core-service.log`, shows
it genuinely became healthy well within `ServiceManager`'s own 60-second
deadline every time:

```
[…] Server listening at http://127.0.0.1:48752
[…] sparstrow core ready
[…] scheduler started
[…] vault watcher started
[…] initializing embedder (downloads model on first run)…
[…] embedder ready: BGE-small-en-v1.5
```

`Server listening` appears roughly 10-20 seconds after the core process is
spawned in every run, well inside `ServiceManager.start()`'s 60-second
deadline (`packages/desktop/src/service-manager.ts:75`) and its 500ms poll
interval. The health route itself (`packages/core/src/api/routes/system.ts`,
`GET /system/health`) sets no special status code and would return a plain
200 as soon as Fastify is listening — there is no reason apparent from
reading the code for `probeHealth()` to keep failing once the server is up.

## Reproduction

1. `cd packages/desktop && npx tsc` (build)
2. `SPARSTROW_APP_URL=<anything> SPARSTROW_PORT=<free port> SPARSTROW_CORE_URL=http://127.0.0.1:<same port> npx electron .`
3. Watch stdout and `data/logs/core-service.log` simultaneously.

**Observed, all three runs:** `[main] core failed to start: … core did not
become healthy` logged, followed (after main.ts's try/catch swallows the
error) by the window opening anyway — which is why this did not block the
rest of T-M11-04's verification, only the local-core-health half of it.
`core-service.log` shows the core reaching `sparstrow core ready` /
`Server listening` in each case.

## Investigation

Root cause isolated by instrumenting `probeHealth()` directly (temporary
`console.log` on both the response branch and the catch branch, including
`err.cause` for thrown errors) and reproducing per the steps above.

The real sequence, straight from instrumented stdout:

```
[probeHealth][DEBUG] threw: TypeError: fetch failed cause={"code":"ECONNREFUSED",...}
[service] spawned core pid=21296
[probeHealth][DEBUG] threw: TypeError: fetch failed cause={"code":"ECONNREFUSED",...}
  ... (repeats while core is still binding — expected, not a bug)
[probeHealth][DEBUG] status=401 ok=false
[probeHealth][DEBUG] status=401 ok=false
  ... (repeats for the rest of the 60s deadline)
```

Once the core actually starts listening, every subsequent probe gets a
**401**, not a connection failure — and 401 makes `res.ok` false forever,
identically to a real outage. `probeHealth()`'s `fetch(HEALTH_URL, …)` sends
no `Authorization` header at all, but `/system/health` is registered inside
`systemRoutes`, which sits behind the `requireAuth` `onRequest` hook applied
to the whole `/api/v1` human/UI surface (`packages/core/src/api/server.ts`
line 80, `api.addHook("onRequest", requireAuth)` — added for the per-install
token / no-auth-RCE closure, `packages/core/src/api/auth.ts`). The desktop
shell's own `core-client.ts` (used by `tray.ts`/`updater.ts` via `coreFetch`)
already reads this token correctly from `<dataDir>/.api-token`
(`SPARSTROW_TOKEN` wins if set) — `service-manager.ts`'s `probeHealth()` was
simply never updated to do the same when the auth gate was added, so it has
been unconditionally unauthenticated since.

All three original candidates are ruled out — confirmed NOT the cause:

- **Electron-main-process networking quirk**: ruled out. The `ECONNREFUSED`
  errors before core binds, and the plain HTTP `401` after, are both normal
  Node/undici `fetch` behavior — nothing Electron-specific. A raw `curl` from
  a separate shell against the same port during the same run got the
  identical `401 {"error":"unauthorized"}` body, proving the server's
  behavior (not Electron's networking) was the discriminator.
- **Timing race between `spawnCore()`'s log writing and the poll loop**:
  ruled out. `core-service.log` filled in correctly and completely on every
  run once the process was given time to actually run (an earlier apparent
  "log never appears" observation during this investigation turned out to be
  the test process being killed before its write stream flushed, not a
  race in the shipped code).
- **`npx electron .` dev-mode vs. packaged build**: ruled out as the cause,
  though genuinely untested for a packaged build specifically — irrelevant
  now since the fix (send the token) applies identically in both modes.

One genuine, separate observation from this pass, **not a code defect**:
on a heavily loaded shared machine (5 agents running in parallel, sustained
100% CPU), core startup itself took ~71s in one run — past the 60s
deadline — versus the ~10-20s the original report saw on a quieter machine.
That is expected resource-contention behavior, not something this fix
changes or should paper over by silently lengthening the deadline.

## Impact

Cosmetic in the immediate term: `main.ts` already catches `services.start()`
throwing and continues to open the window regardless (a deliberate design —
"a supervisor failure must not take core's startup with it" is the pattern
this codebase already follows for the cloud-registration path). Nothing in
this pass observed a user-visible consequence from the window itself.

**What this does affect:** the tray and the updater both talk to the
**local** core through `core-client.ts`/`service-manager.ts`'s own
`CORE_URL`, not through the window. If `ServiceManager` genuinely believes
the core it supervises is unhealthy when it is not, anything gated on
`this.mode === "supervised"` succeeding (restart backoff counting, update
checks, the tray's own status) may be working from a wrong picture. Not
confirmed broken — just unverified, because this task's time-box did not
extend to tray/updater behavior specifically (see
[`T-M11-04`](../tasks/M11/T-M11-04-desktop-window.md)'s Result — computer-use
interaction with the window was unavailable this pass, so the tray icon
itself was never clicked).

## Resolution

**Root cause:** `probeHealth()` in `packages/desktop/src/service-manager.ts`
sent an unauthenticated `fetch()` to `/api/v1/system/health`, which has been
behind the per-install bearer-token `requireAuth` hook since that hardening
landed — every probe after the core actually came up got HTTP 401, which
`res.ok` reports as `false`, indistinguishable from the server being down.
`ServiceManager` never restarts or gives up on a 401 the way it does on a
crash, so the 60s deadline always ran out and `start()` always threw, no
matter how healthy the supervised core genuinely was.

**Fix** (`packages/desktop/src/service-manager.ts`):
- `probeHealth(timeoutMs, token)` now takes an optional per-install token and
  sends it as `Authorization: Bearer <token>` when present.
- `ServiceManager` gained a `dataDir` field (computed identically to how
  `main.ts` derives it for `configureCoreClient()`: `packaged?.dataDir ??
  path.join(repoRoot, "data")`) and a private `token()` method that reads it
  via `core-client.ts`'s existing `readApiToken(dataDir)` — the same
  file/env lookup the tray and updater already rely on through `coreFetch`,
  so there is now exactly one place that knows how to find the token, reused
  by all three call sites.
- Every `probeHealth()` call site in `service-manager.ts` (the "already
  running" check in `start()`, the retry loop in `start()`, and the
  external-core-adoption check in the child `exit` handler) now passes
  `this.token()`. The `stop()` method's shutdown `fetch()` got the same
  `Authorization` header for consistency, though it was already tolerant of
  failure via its catch-and-kill fallback.
- `probeHealth()` still degrades gracefully to an unauthenticated request
  when the token file doesn't exist yet (fresh install, core hasn't written
  `.api-token` yet) — it does not throw, matching prior behavior for that
  edge, and `readApiToken` re-reads the file on every `null` result so it
  picks the token up mid-poll once core creates it.

**Verified:** rebuilt (`npx tsc`), re-ran the exact repro from this file.
Instrumented output before the fix showed the `401`s described above; after
the fix, a clean run logged `[service] core is healthy` and no
`core failed to start` error, and a standalone script calling the built
`probeHealth(1500, token)` against the running core returned `true` (`false`
without a token, `true` with it) — isolating the fix from the shared
machine's CPU-contention timing noise mentioned above.
