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
