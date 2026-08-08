---
id: 0004
category: new-feature
status: done
project: factory
surface: App / Desktop shell + self-update flow
date: 2026-07-13
screenshots: []
links: { plan: "~/.claude/plans/is-the-app-can-shiny-hippo.md", pr: "https://github.com/sparstrow/sparstrowGen/pull/51", followup: "docs/intake/0005-core-port-conflict-dev-vs-packaged-2026-07-13.md" }
resolution: shipped
---

## What I brought (verbatim)

Is the app can be shipped to supabase and vercel? What is your opinion? It is pain to run the
app locally everytime.

(follow-up concern) The Electron app is going to be open 24/7 — it's an agent factory, agents
do their tasks, it needs to be always available. I'm going to build features *inside*
Sparstrowgen itself: create a Sparstrowgen project, pull the main repo in as one of the projects,
use the agents in the app to build the app itself, and I'll be in the loop making the pushes to
main. My main concern: once main is updated, the Electron app should get a notification like
"there's an updated version, do you want to update?" — it should NOT auto-update, because an
agent might be running mid-session; an update that auto-closes and reopens the app would
interrupt the agent's workflow, which I don't want. How do we separate the running Electron app
(from the local repo) from the future updates we make to the projects / main, so updates don't
affect anything?

## What the Listener understood

Two things, one intake item:

1. **Supabase/Vercel is the wrong target.** The core is a local agent factory (spawns local
   CLIs, persistent daemon, local SQLite) — not serverless-deployable. The real need is
   "stop babysitting local," answered by making the app **always-on on this machine**.
2. **Self-hosting the factory to build itself** requires **controlled, non-disruptive
   self-updates**: notify-only (never auto-update), and never interrupt a running agent.

**Decisions locked during planning:**
- **Delivery:** packaged installer + `electron-updater` (notify-only), published to GitHub Releases.
- **Update timing:** wait-for-idle with an explicit "interrupt N agents & update now" override.

**Core insight (resolves the confusion):** three separate locations — (1) the running app *code*
in a versioned install dir, (2) *data* (DB, memory vault, secrets) in a persistent per-user dir
that survives every update, (3) the *dev repo* registered as a normal Sparstrowgen project.
Because #1 is never the folder agents edit and #2 is never inside #1, merging to `main` cannot
affect the running process — it only makes an update *available*.

## Status note

This item entered via a plan-mode design session (not the formal Listener→Curator pipeline) and
produced a **user-approved engineering plan**, embedded below verbatim. Parked for later — run it
through the Curator to confirm mode/routing when ready to build. The full plan also lives at
`~/.claude/plans/is-the-app-can-shiny-hippo.md`.

---

## Approved plan (embedded)

### Context

**Original question — "ship to Supabase + Vercel?"** No, not as-is. The core is a local agent
factory: it spawns local CLIs (`claude`, `agy`, `git`, `node-pty` terminals, a native graph
binary), runs as a persistent daemon (WebSockets, cron, in-memory run/session maps), and uses
local SQLite with a SQLite-specific schema. That's the opposite of serverless — Vercel can't host
it and Supabase would mean rewriting the data layer. The repo's own docs defer this to a
"Phase 6" and say not to build cloud infra yet.

**The real goal.** The pain is "running it locally every time." Chosen direction: make it
**always-on on this machine**, and use the factory to build the factory (register the repo as a
Sparstrowgen project, let agents build features, the user merges to `main`). Hard requirement:
when `main` advances, the running app must **notify, not auto-update**; updates apply only on an
explicit click, and must **never interrupt a running agent**.

### The mental model: three separate locations

| # | Role | Location | Touched by |
|---|------|----------|-----------|
| 1 | **The running app (code)** | Installed app dir (NSIS default, e.g. `%LOCALAPPDATA%\Programs\Sparstrowgen`) — a specific released version | Nobody edits it. Replaced wholesale on update. Runs 24/7. |
| 2 | **The data** | Persistent per-user dir (e.g. `%APPDATA%\Sparstrowgen`) — DB, memory vault, secrets, logs | Read/written by the running core. **Survives every update.** |
| 3 | **The dev repo** | Working checkout (`D:\Sparstrow\Sparstrowgen`), registered as a *Sparstrowgen project* | Agents build features here; user merges to `main`. To the running app it is just one project's data. |

Because #1 is never the folder agents edit, and #2 is never inside #1, **merging to `main` cannot
affect the running process or its data.** Merging only makes an update *available* (once a release
is published). Nothing restarts until the user clicks Update and the factory has drained.

### What the code already gives us (reuse, don't rebuild)

- **Idle signal (the safety guarantee):** run manager tracks in-flight agents synchronously via
  `busyAgents` (`packages/core/src/orchestrator/run-manager.ts:176`). `busyAgents.size === 0` ⇒
  safe to restart.
- **Quiesce + graceful stop:** `POST /system/scheduler {enabled:false}` pauses all cron
  (`packages/core/src/api/routes/system.ts:103`); `POST /system/shutdown` drains gracefully
  (`system.ts:114`); `runManager.cancel()` cancels a run (`run-manager.ts:144`).
- **Env seams for every path:** `dataDir`, `vaultPath`, `memoryMcpPath`, `memoryCliPath` all honor
  `SPARSTROW_*` env overrides (`packages/core/src/config.ts:84-109`) — the packaged shell sets
  these; no `repoRoot` walking in packaged mode.
- **Supervisor + tray:** the desktop shell already spawns/health-waits/crash-restarts core and
  minimizes-to-tray so cron runs headless (`packages/desktop/src/service-manager.ts`,
  `packages/desktop/src/main.ts`). Login-at-startup fires when `app.isPackaged` (`main.ts:34`).
- **UI is host-agnostic:** relative URLs + token injected into the served `index.html`
  (`packages/core/src/api/server.ts:114-130`); core serves the built UI from `SPARSTROW_UI_DIST`.

### Phase 0 — Separation & persistent data (foundation; do first)

- **Redirect all data paths to a persistent per-user location.** In packaged mode the desktop
  shell sets `SPARSTROW_DATA_DIR`, `SPARSTROW_VAULT`, `SPARSTROW_MEMORY_MCP`,
  `SPARSTROW_MEMORY_CLI` (and `SPARSTROW_UI_DIST`, `SPARSTROW_NODE`) before spawning core.
  `dataDir` → `app.getPath("userData")/data`; vault → `…/memory`. No `config.ts` logic change
  needed — the env hooks already exist. (Optional: harden `config.ts` so a packaged run never
  falls back to a bogus `repoRoot`.)
- **Register the dev repo as a project**, not the runtime. Agents build in its worktrees; the user
  merges to `main`. Confirms location #3 is pure data to the app.
- **Interim "always-on today":** while Phases 1–3 are built, run the existing shell against a
  **separate pinned clone** (not the dev repo) via `electron .` + a Windows Startup shortcut.
  Delivers the "stop babysitting" outcome immediately. Retired once the installer ships.

### Phase 1 — Make the packaged app self-contained (the bulk of the work)

- **Build core to runnable JS.** Core has no build script — only `tsx src/index.ts`. Add an
  esbuild/tsup bundle emitting `dist/index.js`, native modules external. Same for `memory-mcp` /
  `memory-cli` (already emit `dist/index.cjs`); ensure they're bundled.
- **Ship a plain Node runtime + native modules.** Core must run on plain Node, never
  Electron-as-Node (native-ABI comment at `service-manager.ts:85`). Bundle a Node binary whose ABI
  matches the prebuilt `.node` files for `better-sqlite3`, `node-pty`, `sqlite-vec`, and
  `fastembed`/onnxruntime; `asarUnpack` them; point `SPARSTROW_NODE` at the bundled Node.
- **electron-builder config** (`packages/desktop/package.json`): add `extraResources` for
  `{core,ui/dist,memory-mcp,memory-cli,node-runtime}`, `asarUnpack` for native `.node`, and a
  `publish` block targeting GitHub Releases.
- **Rewire the supervisor** (`service-manager.ts`): in packaged mode spawn
  `${bundledNode} resources/core/dist/index.js` (not `tsx`), resolve resource paths from
  `process.resourcesPath` instead of `findRepoRoot`, and export the `SPARSTROW_*` env from Phase 0.
- **Verify:** install to a clean machine/dir with no repo present → app launches, core healthy, UI
  loads, DB lands in userData, an agent run spawns (with `claude`/`agy` on PATH), memory/task
  tools work.

### Phase 2 — Controlled, drain-aware update flow

**Core (new surface):**
- Add a `draining` flag; `tick()` admits no new runs while draining (`run-manager.ts:171`).
- `POST /system/prepare-update` → pause scheduler (`setSchedulerEnabled(false)`), set `draining`,
  return the list of still-running runs.
- `GET /system/update-readiness` → `{ busy: busyAgents.size, runs: [...] }`.
- `POST /system/resume-after-update` → clear `draining`, resume scheduler (if the user cancels).
  Add to `system.ts`; share contract types in `packages/shared`.

**Desktop main (`main.ts`):**
- Add `electron-updater` in **notify-only** mode (`autoDownload=false`,
  `autoInstallOnAppQuit=false`). On interval `checkForUpdates()`; on `update-available` push an IPC
  event to the renderer + tray badge.
- On "Download" → `downloadUpdate()`; on `update-downloaded` enable "Install & restart".
- On "Install": call `prepare-update`, poll `update-readiness`, show "waiting for N agents…"; when
  `busy===0` → `autoUpdater.quitAndInstall()`. **Override:** an "interrupt N & update now" action
  cancels active runs (`runManager.cancel`) then installs. Never installs silently.

**UI (`packages/ui/src`):** an update banner/panel (available → download → install&restart) driven
by IPC via `preload.ts`; shows drain status + the override button. Absent in the browser/dev
(non-Electron) context.

### Phase 3 — Release publishing (closing the loop)

- **GitHub Action on a version tag** (Windows runner): `electron-builder --publish always` →
  uploads the NSIS installer + `latest.yml` (electron-updater's feed) to GitHub Releases. Handles
  private-repo download auth if the repo is private.
- **Version convention:** bump the desktop app version + tag `vX.Y.Z` as the release gesture in
  the merge/ship flow (no VERSION file exists today; version lives in `package.json`).
  electron-updater compares `app.getVersion()` to the published `latest.yml`.
- **End-to-end verify:** merge a feature to `main` → bump+tag → CI publishes a release → the
  always-on app shows "Update available" → click → new work pauses, running agents finish → app
  swaps to the new version and relaunches → **DB, memory, and secrets intact** (in userData).

### Critical files

- Data/paths: `packages/core/src/config.ts` (env-driven; optional packaged-mode hardening)
- Packaging + supervisor: `packages/desktop/package.json`, `packages/desktop/src/service-manager.ts`,
  `packages/desktop/src/main.ts`, `packages/desktop/src/preload.ts`, `packages/desktop/src/tray.ts`
- Core build tooling: new bundler config in `packages/core` (+ confirm `memory-mcp`/`memory-cli`
  builds)
- Update endpoints + drain: `packages/core/src/api/routes/system.ts`,
  `packages/core/src/orchestrator/run-manager.ts`, `packages/core/src/lifecycle.ts`, shared types
  in `packages/shared`
- UI update surface: `packages/ui/src` (banner + IPC bridge)
- Release CI: new workflow in `.github/workflows/`

### Risks & notes

- **Native-module ABI is the main technical risk** (Phase 1): the bundled Node's ABI must match
  `better-sqlite3` / `node-pty` / onnxruntime / `sqlite-vec` prebuilds. Pin a Node version with
  available prebuilds and `asarUnpack` the `.node` files.
- **Effort is front-loaded in Phase 1** (real packaging work). Phase 0's interim git-pinned
  runtime gives "always-on" immediately so you're not blocked.
- **Data migration:** existing local `data/` (current repo) should be copied into the new
  persistent userData location on first packaged launch, or start fresh — decide before cutover.
- **The app still runs only on this machine** (accepted tradeoff); agents still need `claude`/`agy`
  on PATH and provider keys in the secret vault — same as today.
- **Out of scope:** Supabase/Vercel/cloud hosting, multi-user auth, SQLite→Postgres — deferred
  Phase 6.
