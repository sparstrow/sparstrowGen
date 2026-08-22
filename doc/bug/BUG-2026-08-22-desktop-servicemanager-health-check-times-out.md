# BUG-2026-08-22-desktop-servicemanager-health-check-times-out

**Status:** 🔴 open
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

Not fully isolated — this is reported at the "here is what happened,
verified against the actual log content, not just the error surfaced" level
per `AGENTS.md` §3.4, but the root cause inside `probeHealth()`'s
`fetch(HEALTH_URL, …)` was not traced further (no `--trace-warnings`,
no packet capture, no instrumentation added to `service-manager.ts`).
Candidates not yet ruled out:

- A loopback/firewall quirk specific to this sandboxed Windows environment
  that blocks or delays `fetch` calls from Electron's **main process**
  specifically (Node's `fetch` in Electron's main process uses a different
  network stack than a renderer or a plain Node CLI — this repo has hit
  Electron-vs-plain-Node behavioral differences before, e.g. stdio MCP not
  finishing its handshake headlessly on Windows, per the project's own
  memory notes)
- A timing race between `ServiceManager.spawnCore()`'s own log-file writing
  and its `probeHealth()` polling loop that only manifests when the
  process takes several seconds to bind
- Something specific to launching via `npx electron .` in dev mode rather
  than a packaged build (untested)

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

<!-- Open. Needs someone to add a print statement or use --trace-warnings
     inside probeHealth() to see the actual fetch failure reason (network
     error vs timeout vs non-ok status), on a machine where this reproduces. -->
