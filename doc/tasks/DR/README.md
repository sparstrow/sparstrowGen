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
| T-DR-04 — Fix the desktop build chain and verify a real installer | foundational | not started — see below |

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
| **Serves** | foundational — closes the packaged-installer half of [G-54](../../KnownGaps.md#g-54--two-channel-desktop-release-no-live-nsis-install-no-verified-real-installer-build) |
| **Depends on** | — (does not need Vercel or a live `staging.sparstrow.com` — see Traps) |
| **Status** | not started |

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

- [ ] Root-cause why the `core` legacy deploy step leaves the workspace
      looking stale to pnpm's status check (try running deploy with
      `--ignore-scripts`, or without `--legacy` if the pnpm version in use
      supports the non-legacy path now, or isolate deploy's target dir from
      the main workspace's dependency graph)
- [ ] Fix so the full `dist:staging` / `dist:stable` chain runs cleanly with
      no manual `CI=true` / reinstall intervention needed
- [ ] Build a **local, unpublished** staging installer
      (`electron-builder --publish never`, not `dist:staging`'s
      `--publish always`) and install it
- [ ] Point the installed app at `http://localhost:3000` via the
      `SPARSTROW_APP_URL` environment variable (Windows: set it as a
      user/system env var before launching the installed `.exe`, since a
      packaged app doesn't inherit a terminal's shell env the way `npm start`
      in dev mode does) and confirm it loads real content, not the Vercel
      "Deployment Paused" page
- [ ] Repeat for stable, install both side by side, confirm separate userData
      dirs / Start Menu entries / no collision
- [ ] `pnpm --filter @sparstrow/desktop typecheck` and `test` green if any
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

- [ ] `dist:staging` (with `--publish never`) completes with exit 0, no
      manual intervention
- [ ] Installed app launches, tray icon appears, window loads
      `http://localhost:3000` content (not a Vercel error page) when
      `SPARSTROW_APP_URL` is set
- [ ] Both stable and staging installed side by side, confirmed as separate
      Start Menu entries / processes, one uninstall doesn't affect the other

### Result

<!-- Not started. -->
