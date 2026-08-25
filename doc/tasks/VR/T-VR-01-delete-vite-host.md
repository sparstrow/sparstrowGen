# T-VR-01 — delete the Vite host

| | |
|---|---|
| **Tag** | `[S]` — one coherent removal; splitting it leaves the tree in a state where something builds a bundle nothing serves |
| **Serves** | foundational — unblocks T-VR-02 by removing the second router |
| **Depends on** | — |
| **Blocks** | T-VR-02 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

## Objective

Remove the Vite application and everything whose only purpose is to build,
serve or package its output. Leave `packages/ui` importable as a library —
`apps/web` depends on it and must keep typechecking throughout.

## Decisions already made

**`packages/ui` keeps its name and its `src/`.** Only the host goes: the entry
(`index.html`, `main.tsx`), the router (`router.tsx`), the Vite shell
(`components/layout/app-shell.tsx`), the build config and the scripts. Pages
and components stay put in this task and move in T-VR-03.

**Core stops being a web host.** The `fastifyStatic` block serves
`packages/ui/dist`, which will no longer exist. It is gated on the file
existing, so leaving it would be dead code that silently does nothing — worse
than removing it, because it reads as a working feature. `SPARSTROW_UI_DIST`
goes with it.

**Electron's default becomes the hosted app.** `resolveAppUrl` currently falls
back to `resolveLocalUiUrl` when `SPARSTROW_APP_URL` is unset, which is what
makes a packaged build open the old UI. That fallback is the bug D-24 was
written about.

## Checklist

- [x] `packages/ui`: delete `index.html`, `vite.config.ts`, `src/main.tsx`,
      `src/router.tsx`, `src/components/layout/app-shell.tsx`
- [x] `packages/ui/package.json`: drop the `dev` and `build` scripts and the
      Vite-only dependencies; keep everything `apps/web` imports
- [x] `packages/ui/tsconfig.json`: drop `vite.config.ts` from `include`
- [x] `packages/core/src/api/server.ts`: delete the static-serving block, the
      `SPARSTROW_UI_DIST` read, the SPA `setNotFoundHandler`, and the now-unused
      `fastifyStatic` / `fs` / `path` imports if nothing else uses them.
      A plain 404 JSON handler replaces the SPA fallback
- [x] `packages/desktop/scripts/prepare-resources.mjs`: drop the `ui/` staging
      step and its `mustExist` check
- [x] `packages/desktop/src/urls.ts`: delete `resolveLocalUiUrl`,
      `DEFAULT_DEV_UI_URL` and the `SPARSTROW_DEV` branch; `resolveAppUrl`
      returns the configured URL, falling back to the local core only if that
      is still wanted — see Traps
- [x] `packages/desktop/src/urls.test.ts`: update the tests that assert the old
      fallback. **Do not delete a test to make it pass** — each one asserts a
      behaviour that either still holds or has deliberately changed
- [x] `pnpm typecheck` green
- [x] `pnpm test` green

## Traps

**`resolveAppUrl` unset is not obviously "the hosted app".** There is no
compiled-in production URL today, and inventing one means a packaged build
points at a domain that may not be the user's. Prefer: keep the local-core
fallback for the *unset* case so a dev checkout still works, and make the
packaged build set `SPARSTROW_APP_URL` explicitly. What must go is the
assumption that the local URL serves a *UI* — after this task it serves only an
API, so falling back to it should produce the offline screen, not a blank page.
Decide this explicitly and record it here; do not let it be implied by whatever
the tests happen to accept.

**`repoRoot` in `server.ts` may have other users.** Check before deleting it
along with the `uiDist` path it was computed for.

**Do not touch `apps/web/src/components/layout/app-shell.tsx`.** It shares a
filename with the one being deleted and is the one that survives.

## Result

**Done 2026-08-24.** The Vite host, everything that built or served its output,
and the three consumers of `packages/ui/dist` are gone.

### The decision the Traps section asked for, taken explicitly

`resolveAppUrl` now returns `string | null` and **has no fallback**. Unset was
previously the local UI; core no longer serves one, so falling back there would
have loaded the API root and rendered a bare 404 in the desktop window — a
worse answer than saying nothing is configured. `main.ts` shows the existing
offline screen with "SPARSTROW_APP_URL is not set" instead.

Deliberately *not* done: inventing a default production hostname. The original
file's reasoning still holds — a default naming a domain the user never chose
turns "not configured" into a DNS error. A packaged build sets the variable
explicitly, which is `D-24`'s model anyway.

`resolveLocalUiUrl`, `DEFAULT_DEV_UI_URL`, `SPARSTROW_DEV`, `SPARSTROW_UI_URL`
and `SPARSTROW_CORE_URL` all went with it. `DEFAULT_CORE_URL` survives, used
only so the unconfigured screen can name the daemon.

### Not in the original checklist, found while doing it

- **`packages/ui/vitest.config.ts` had to be created.** `vite.config.ts`
  carried the `@` alias that *vitest* also resolved through — deleting it
  outright would have broken every test in the package. The new file is that
  alias and nothing else.
- **`packages/desktop/src/packaged-env.ts`** set `SPARSTROW_UI_DIST` for the
  packaged runtime; removed, since nothing reads it now.
- **`main.ts`'s `did-fail-load` handler** used `APP_URL`, now nullable. Switched
  to `validatedURL`, which is more accurate anyway — it is what actually failed,
  which after an in-app navigation need not be where the window started.

### Verification

- `pnpm typecheck` — **green, 7/7 packages**
- `pnpm test` — **green, 718 passing / 4 skipped across 84 files, 5/5 packages**

The first `pnpm test` run failed two core tests on timeouts. Investigated
rather than re-run-and-shrugged: both pass in isolation on the same tree, a
second full run with no code change went green, and the cause is
[`BUG-2026-08-22-core-tests-flake-under-turbo-parallelism`](../../bug/BUG-2026-08-22-core-tests-flake-under-turbo-parallelism.md),
which was marked resolved and **has been reopened** with the specific gap
found here: `variants.test.ts` sets a per-test timeout *below* the package
default, so the package-level fix never applied to it. Not fixed in this task —
it is pre-existing and orthogonal, and the reasoning is recorded in the bug.

**Not verified:** nothing was rendered in a browser. This task deletes a host
and touches no page, so there is nothing visual to regress; the browser pass
belongs to `T-VR-05` against the feature branch's Vercel preview, per the
plan.
