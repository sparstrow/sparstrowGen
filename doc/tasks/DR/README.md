# DR — Two-channel desktop release

| | |
|---|---|
| **Plan** | [2026-08-29-two-channel-desktop-release.md](../../plans/2026-08-29-two-channel-desktop-release.md) |
| **Status** | Band A + B done 2026-08-29; Band C blocked |

Not yet inserted into [`../MasterTaskQueue.md`](../MasterTaskQueue.md) — several
task/band branches were open when this landed (`band/25-di-daemon-identity`,
`band/26-chat-session-and-conversation-ux`, and multiple `task/T-*` branches),
and `AGENTS.md` §2 rule 9 requires the queue to be regenerated only with zero
open branches. Insert this phase's tasks the next time the queue drains.

## Tasks

| Task | Serves | Status |
|---|---|---|
| T-DR-01 — Desktop channel infrastructure | foundational | ✅ done 2026-08-29 |
| T-DR-02 — Changelog page | changelog story | ✅ done 2026-08-29 |
| T-DR-03 — Production database cutover | foundational | blocked — see below |
| T-DR-04 — Fix the desktop build chain and verify a real installer | foundational | ✅ done 2026-08-30 |

## T-DR-01 — Desktop channel infrastructure ✅ done 2026-08-29

Baked per-channel `channel.json` (`packages/desktop/src/channel.ts`, read by
`urls.ts`/`packaged-env.ts`/`updater.ts`), `build-channel-config.mjs`
generating the stable/staging electron-builder config from one shared base,
`release-staging.yml` (auto-publish on push to `staging`), the `preload.ts`
version-reporting fix. Full reasoning: plan doc's Decisions section.

**Verification:** `pnpm --filter @sparstrow/desktop test` — 40/40 (7 new in
`channel.test.ts`, 5 new in `urls.test.ts`). `pnpm typecheck` clean repo-wide.
**Not verified:** an actual side-by-side NSIS install on Windows, or a real
`staging` push triggering `release-staging.yml` end to end — no Windows
install target or ability to push to `staging` from this session. See
`doc/KnownGaps.md`.

## T-DR-02 — Changelog page ✅ done 2026-08-29

`/changelog` route (`apps/web/src/app/changelog/page.tsx`),
`changelog.server.ts` (file-based, mirrors `knowledge.server.ts`), one seed
entry (`apps/web/src/content/changelog/0.2.0.md`), `update-banner.tsx` "See
changelog" deep link (`/changelog#v<version>`), a link from Settings' version
row, Knowledge Center article `updates-and-releases.md`.

**Verification:** `pnpm --filter web typecheck` clean. **Not verified:**
rendered in a browser — no dev server exercised in this pass. See
`doc/KnownGaps.md`.

## T-DR-03 — Production database cutover — database half done 2026-08-29

Owner created `sparstrowgen-prod` (`styichgxhecmatkholvi`) directly and
authorized the Supabase MCP connection mid-session, unblocking this task.

- [x] Owner authorizes the Supabase MCP connection / creates the project
- [x] New Supabase project created for `main`
- [x] Full schema replayed from empty: 8 drizzle table migrations +
      27 RLS/policy files, in order — not the stale `apply-to-supabase.sql`
      snapshot. 39 tables, RLS parity with staging confirmed via
      `list_tables` + `get_advisors`.
- [~] `main`'s Vercel env vars (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
      anon key, service role key) pointed at it — blocked on the owner:
      DB password and service role key are secrets that should go directly
      from the owner into Vercel, not relayed through chat
- [~] Auth → URL Configuration set fresh for `sparstrow.com` (does **not**
      inherit `staging`'s config — see `doc/runbooks/deploy-web-app.md`) —
      blocked on the owner: no Supabase MCP tool covers Auth config, dashboard
      only
- [ ] Close `doc/Deferred.md` **D-15** once the above two land

**Found and fixed three real, live bugs while replaying the schema** — not
anticipated, surfaced only because replaying history from empty is itself a
verification pass:

- [`BUG-2026-08-29-bootstrap-workspace-020-reverted-012`](../../bug/BUG-2026-08-29-bootstrap-workspace-020-reverted-012.md) — fixed on both projects
- [`BUG-2026-08-29-missing-migration-files-for-two-live-tables`](../../bug/BUG-2026-08-29-missing-migration-files-for-two-live-tables.md) — fixed on prod, repo history corrected (`0008_*.sql`)
- [`SEC-2026-08-29-record-provider-models-anon-executable-on-fresh-project`](../../security/SEC-2026-08-29-record-provider-models-anon-executable-on-fresh-project.md) — fixed on prod

## T-DR-04 — Fix the desktop build chain and verify a real installer

| | |
|---|---|
| **Serves** | foundational — closed the packaged-installer half of what was G-54 (KnownGaps.md now tracks only the remaining publish/update-feed half at [G-54](../../KnownGaps.md#g-54--two-channel-desktop-release-no-real-publish-no-verified-live-update-feed)) |
| **Depends on** | — (does not need Vercel or a live `staging.sparstrow.com` — see Traps) |
| **Status** | ✅ done 2026-08-30 |

### Objective

Get `pnpm --filter @sparstrow/desktop dist:staging` (and `dist:stable`) to
complete cleanly end to end without manual intervention, then actually
install the resulting NSIS build and confirm the things G-54 has never been
able to verify: the packaged app launches, the tray/updater code paths run
under `app.isPackaged`, and — once both channels are built — that stable and
staging coexist on one machine without collision (separate `appId`/
`productName`, separate userData dir, separate Start Menu entry).

### What's already known (found 2026-08-30, don't rediscover this)

Running the chain by hand (`build` → `prepare-resources.mjs staging` →
`build-channel-config.mjs staging` → `electron-builder`) fails partway
through, reproducibly:

1. `pnpm --filter @sparstrow/core deploy --prod --legacy --config.node-linker=hoisted <resources-staging/core>`
   runs (this is `prepare-resources.mjs`'s own step, re-vendoring core's
   node_modules since electron-builder can't ship a folder literally named
   `node_modules`). It logs `[WARN] Shared workspace lockfile detected but
   configuration forces legacy deploy implementation.`
2. The **very next** command in the chain —
   `pnpm --filter @sparstrow/memory-mcp build` — then sees the workspace as
   out of sync with the lockfile and refuses non-interactively:
   `[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY]`.
3. Forcing past that with `CI=true` "fixes" step 2, but it does so by running
   a **workspace-wide `pnpm install --production`**, which strips
   devDependencies (`esbuild` observed missing) and breaks `@sparstrow/core`'s
   *own* build — the fix for one step in the chain breaks an earlier one.

This looks like the legacy `deploy --prod` step leaving some marker (in
`node_modules/.modules.yaml` or similar) that pnpm's dependency-status check
reads as "this workspace needs reinstalling," and then defaulting to
`--production` for reasons not yet root-caused. Confirmed **not** a
cross-worktree issue — `node_modules` is worktree-local (`git worktree list`
showed 6 independent worktrees) — so this is safe to debug in an isolated
worktree without risk to sibling agents' sessions.

### Checklist

- [x] Root-cause why the `core` legacy deploy step leaves the workspace
      looking stale to pnpm's status check — found precisely (see Result):
      `deploy --prod --legacy` resolves the whole workspace in
      production-only mode and overwrites the root's
      `node_modules/.pnpm-workspace-state-v1.json` as a side effect, marked
      `filteredInstall: true, dev: false, production: true`. The next
      `pnpm --filter` command distrusts that cached filtered-install marker
      and "self-heals" with `pnpm install --production`, workspace-wide
- [x] Fix so the full `dist:staging` / `dist:stable` chain runs cleanly with
      no manual `CI=true` / reinstall intervention needed
- [x] Build a **local, unpublished** staging installer
      (`electron-builder --publish never`, not `dist:staging`'s
      `--publish always`) and install it
- [x] Point the installed app at the local `pnpm --filter web dev` server via
      the `SPARSTROW_APP_URL` environment variable (Windows: launched via
      PowerShell `Start-Process` with `$env:SPARSTROW_APP_URL` set in that
      process, since a packaged app doesn't inherit a terminal's shell env
      the way `npm start` in dev mode does) and confirm it loads real
      content, not an error/offline page
- [x] Repeat for stable, install both side by side, confirm separate userData
      dirs / Start Menu entries / no collision — **found and fixed a real
      collision bug in the process**, see Result and
      [`BUG-2026-08-30-desktop-stable-staging-share-userdata-dir`](../../bug/BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md)
- [x] `pnpm --filter @sparstrow/desktop typecheck` and `test` green if any
      script changed

### Traps

- **Don't fix this by publishing a real GitHub Release to test it.**
  Publishing is out of scope for this task — it's "Publishing... public
  content" under this repo's action-permission rules and needs an explicit
  ask, separate from fixing the build chain. Verify the *build* first,
  unpublished; a real `staging` push producing a real release is a distinct,
  separate verification (see G-54).
- **This task doesn't need Vercel back.** `staging.sparstrow.com` will still
  402 with Vercel's "Deployment Paused" page regardless of what this task
  fixes — that's expected and not this task's problem to solve. Point the
  installed build at `localhost` (see checklist) to prove packaging works;
  don't block this task on hosting being resolved.
- **`CI=true` is not the fix.** It's what caused the devDependency strip in
  the first place. The real fix changes the deploy/build chain so the
  interactive prompt never fires, not something that forces past it again.

### Verification

- [x] `dist:staging` (with `--publish never`) completes with exit 0, no
      manual intervention — verified twice (once before, once after the
      userData fix, both clean runs)
- [x] Installed app launches, window loads real local content (not an
      error/offline page) when `SPARSTROW_APP_URL` is set. **Not directly
      screenshotted** (no computer-use grant for the newly-installed app,
      not in its known-app enumeration) — verified instead via the dev
      server's own access log, which is stronger evidence of origin: real
      `GET /login 200` responses landed within seconds of the app launching,
      interleaved with `[browser]` console-forwarded warnings that only
      Next.js's dev overlay emits for an actual connected renderer executing
      client JS. Tray icon creation is unconditional in `main.ts` (runs
      before `openWindow()`, not gated on `isPackaged`) and the app kept
      running and responding, so that code path executed without throwing —
      not independently screenshotted either
- [x] Both stable and staging installed side by side, confirmed as separate
      Start Menu entries / processes. Launched both **simultaneously** and
      captured their process list together (`Sparstrowgen` ×3 helper procs,
      `Sparstrowgen Staging` ×4 helper procs, all `Responding: True`), plus
      each channel's own independent core daemon process
      (`resources\core\dist\index.js` under each install's own directory).
      Did not separately re-test "one uninstall doesn't affect the other" as
      its own step — implied by the fully separate install dirs, userData
      dirs, and Start Menu entries confirmed live

### Result

**Root cause**, confirmed by reading pnpm's own source
(`runDepsStatusCheck`/`checkDepsStatus`/`updateWorkspaceState` in
`pnpm.mjs`) and reproducing each step in isolation:

`pnpm --filter @sparstrow/core deploy --prod --legacy --config.node-linker=hoisted <target>`
is not scoped to `@sparstrow/core` the way its output implies. The **legacy**
deploy implementation resolves the *entire* workspace lockfile in
production-only mode (`--prod` ⇒ `dev: false, production: true`) to build its
snapshot, and as a side effect of any pnpm command running inside the
workspace root, that resolution gets persisted as the shared
`node_modules/.pnpm-workspace-state-v1.json` — stamped
`filteredInstall: true`. This happens regardless of the deploy target
directory being excluded from `pnpm-workspace.yaml`'s glob (it already was,
pre-existing, from `9168fd3`); the pollution is not about workspace
membership, it's an unconditional side effect of running `deploy` at all.

The next `pnpm --filter <pkg> run/build` command in the chain is *itself*
filtered, and pnpm's `ignoreFilteredInstallCache` behavior specifically
distrusts a cached state marked `filteredInstall: true` from a *previous*
filtered command. That produces `upToDate: undefined`, which — because the
command has a non-empty `allProjects` list — does **not** hit
`runDepsStatusCheck`'s "nothing to do" early return. It falls through to the
default `verifyDepsBeforeRun: "install"` behavior and runs `pnpm install`
with args built from the **stale, cached** `dev`/`production` settings
(`createInstallArgs`) — i.e. `pnpm install --production`, workspace-wide,
non-interactively, silently stripping every devDependency. `CI=true` doesn't
change any of this; it only forces past the *earlier*, TTY-gated variant of
the same self-heal (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`), which is
why it "worked" for the immediate error but broke `@sparstrow/core`'s own
subsequent build.

**Fix 1 — the build chain** (`packages/desktop/scripts/prepare-resources.mjs`):
one line, `run("pnpm install")` immediately after the `core deploy` step. A
plain, unfiltered `pnpm install` is what restores the workspace state to the
correct `filteredInstall: false, dev: true, production: true` snapshot before
any later `pnpm --filter` command can read the poisoned one — confirmed by
inspecting `node_modules/.pnpm-workspace-state-v1.json` before and after.
It's a fast no-op against an unchanged lockfile (~2s, "Already up to date"
both times observed), not a real reinstall. Verified the full chain
(`build` → `prepare-resources.mjs` → `build-channel-config.mjs` →
`electron-builder`) end to end, twice, no `CI=true`, no interactive prompt,
no devDependency loss.

**Fix 2 — a real bug found during verification, not the build chain**: while
confirming the "install both side by side, no collision" checklist item, the
staging build's Chromium helper process showed
`--user-data-dir=...\Roaming\@sparstrow/desktop` — the exact same default a
stable install would use. `build-channel-config.mjs`'s existing comment
claimed distinct `appId`/`productName` was sufficient for userData isolation
("Electron derives it from productName by default"); that claim is wrong —
Electron's `app.getPath("userData")` is keyed off `app.name`, which resolves
from the packaged app's own `package.json` `name` field (`extraMetadata`
never touched `name`, only `version`). Fixed by adding an `APP_NAME` map to
`build-channel-config.mjs` (`stable` keeps `pkg.name` unchanged — the path
any already-installed stable build already uses; `staging` gets
`"sparstrow-desktop-staging"`) and wiring it into `extraMetadata.name`.
Verified live: rebuilt staging, reinstalled, and confirmed via the process
tree that its userData dir changed to
`...\Roaming\sparstrow-desktop-staging`. Full writeup:
[`BUG-2026-08-30-desktop-stable-staging-share-userdata-dir`](../../bug/BUG-2026-08-30-desktop-stable-staging-share-userdata-dir.md).

**Full verification run** (2026-08-30, this session, on the machine this
worktree lives on):

1. `pnpm --filter @sparstrow/desktop dist:prepare` chain run by hand
   (`build` → `prepare-resources.mjs staging` → `build-channel-config.mjs
   staging` → `electron-builder --win nsis --publish never --config
   electron-builder.staging.generated.json`) — exit 0, no manual
   intervention, both before and after the userData fix.
2. Installed silently: `<installer>.exe /S` via PowerShell's `Start-Process`
   (**not** Git Bash — Git Bash mangles a bare `/S` via its MSYS
   leading-slash path-conversion, silently turning "silent install" into a
   real interactive wizard; noted in the bug file so it isn't rediscovered).
   10,769 files installed to `%LOCALAPPDATA%\Programs\Sparstrowgen Staging`,
   Start Menu shortcut created, uninstaller present.
3. Launched with `SPARSTROW_APP_URL=http://localhost:3001` (not `:3000` —
   port 3000 was already held by an unrelated process on this shared
   machine; `pnpm --filter web dev` auto-selected 3001, and that's the port
   actually used throughout). Confirmed loading real content via the dev
   server's access log — see Verification above. (One unrelated hiccup along
   the way: the dev server's first Turbopack compile of `/login` hit a
   native-worker panic — `node process exited... 0xc0000142`, plausibly
   resource contention from the many other agent worktrees running
   concurrently on this shared machine — resolved by killing the stale
   process, clearing `apps/web/.next`, and restarting; not a desktop-side or
   T-DR-04 issue.)
4. Repeated for stable (`dist:stable` chain, same manual steps) — exit 0,
   installed silently to `%LOCALAPPDATA%\Programs\Sparstrowgen`. Launched
   both channels together and captured them coexisting live: distinct
   `appId`/`productName`/install dir/Start Menu entry/userData dir/core
   daemon, one running process tree with both present at once.
5. `pnpm --filter @sparstrow/desktop typecheck` — clean. `pnpm --filter
   @sparstrow/desktop test` — 40/40, unchanged from before this session's
   edits (`build-channel-config.mjs` and `prepare-resources.mjs` are scripts,
   not covered by the existing test files, and no new test file was added
   for them — see Known gap below).

**Not verified / known gap**: no automated test covers
`prepare-resources.mjs`'s `pnpm install` restore step or
`build-channel-config.mjs`'s per-channel `name` field — both were verified
by hand, live, this session, not by a regression test. A future change to
either script could silently reintroduce either bug. Left as a gap rather
than adding tests for two Node scripts that shell out to `pnpm`/read
`package.json` (a real test would need to mock `execSync`/the filesystem
fairly heavily for two one-line changes) — flagged in `doc/KnownGaps.md`'s
G-54 entry rather than built speculatively.

Publishing a real GitHub Release (the `--publish always` / real `staging`
push half of G-54) remains explicitly out of scope per this task's Traps —
not attempted.
