# Phase 3 — `apps/desktop` is a real SPA

**Plan:** [`2026-09-02-multica-architecture-restructure.md`](../plans/2026-09-02-multica-architecture-restructure.md)
**Branch:** `claude/multica-app-architecture-0a3e6f`
**Status:** ✅ Complete — both gates met, verified against a running window.

## Goal

Stop shipping a web server inside the desktop app, and prove the shell renders
the shared components.

## Result — what was actually run

`pnpm typecheck` 9/9. `pnpm test` 1676.

### Gate 1 — the window opens and renders the SPA

Verified over CDP against the running app, not inferred from a build succeeding:

| | |
|---|---|
| url | `file:///…/apps/desktop/out/renderer/index.html` — **no server** |
| title | Sparstrowgen |
| body | "Not signed in / The server is running and reachable…" |
| CSS | 88 rules, `body` `oklch(0.145 0.01 85)`, header `44px` — Tailwind applied |
| bridges | `window.__SPARSTROW_SERVER_URL__` = `http://127.0.0.1:8080`, `window.sparstrowDesktop.version` = `0.2.0` |

That "reachable but not signed in" is not placeholder text. The renderer
actually reached `server/` on `:8080` and got a 401 — the two-question split
(`isReachable()` vs `/workspace`) working as designed.

### Gate 2 — `pnpm package` produces an installer that launches

`release/Sparstrowgen Setup 0.2.0.exe`, 194 MB. The **packaged** app was then
launched and inspected the same way:

- url `…/win-unpacked/resources/app.asar/out/renderer/index.html` — the SPA
  loaded from inside the asar
- same 88 CSS rules, same theme, same working preload bridges
- reached `server/` on loopback and reported "Not signed in"

`resources/` contains `app.asar`, `channel.json`, `core`, `memory-cli`,
`memory-mcp`, `node-runtime`. **No `web/`.**

## What was deleted

`spawnWeb()` and every trace of it: a second child process, a second log stream
and its rotation branch, the `webPort` field, `webEntry`/`webCwd` in
`PackagedPaths`, the `web` entry in `extraResources`, and the Next.js build step
in `prepare-resources.mjs`. `ServiceManager.stop()` now has one child to reason
about instead of two.

`resolveAppUrl` was demoted from "the only way the window finds a UI" to an
operator's override, and lost the `localPort` parameter along with the server
that supplied it.

Also removed: the `ui` entry in `extraResources`, which nothing has staged for a
long time — electron-builder printed `file source doesn't exist` on every build
and nobody had looked.

## The bug this phase found

[`BUG-2026-09-03`](../bug/BUG-2026-09-03-desktop-app-quits-instantly-when-run-unpackaged.md)
— **the app quit instantly on every unpackaged launch**, exit 0, no window, no
output. `requestSingleInstanceLock()` returned false with nothing else running,
because the app's name was the npm scope `@sparstrow/desktop` and `userData`
became `…\Roaming\@sparstrow/desktop`. Packaged builds were never affected,
which is why it survived: it broke only the path a developer uses to look at
the app. One missing `productName` field.

Found by running it and refusing to accept `exit 0` — a throwaway Electron app
proved the environment, a wrapper requiring the real built main proved the code,
and a probe printing `getName`/`userData`/`lock` named the cause.

## What the plan asked for and did not get, with the reason

**The bundled Node runtime stays.** The plan expected it to go with the web
server; it cannot yet. The daemon imports four native addons — `better-sqlite3`
plus `node-pty`, `fastembed` and `sqlite-vec` from the three *parked*
subsystems — and a native addon is compiled for one Node ABI, which Electron's
is not.

Parking a subsystem is not the same as unwiring it: those imports are still at
module scope, so the modules still load. Recorded as [`G-64`](../KnownGaps.md)
with the order spelled out — unwire the parked imports, then `node:sqlite`
replaces `better-sqlite3`, and only then can the runtime go. The plan's
prediction was right and one phase early.

## Deliberately not done

- **Sign-in.** The window correctly reports "not signed in"; the loopback flow
  that mints a session belongs with Phase 4, where it can be tested end to end
  against a real agent run.
- **Chat, runs, projects.** Phase 4 adds them as more imports from
  `@sparstrow/views`, not as more of `app.tsx`.
- **`channel.appUrl`** is now dead and documented as such rather than deleted,
  so existing `channel.json` files still validate. `cloudUrl` beside it is
  still live and still means something different.
