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

## T-DR-03 — Production database cutover — blocked

Owner said "create it now" (2026-08-29), but the Supabase MCP connection in
this session was not authorized, and creating a production project isn't
something to do unilaterally without that authorization or the owner doing it
directly. Needs:

- [ ] Owner authorizes the Supabase MCP connection (`claude mcp` / `/mcp`), or
      creates the project directly in the Supabase dashboard
- [ ] New Supabase project created for `main`
- [ ] `main`'s Vercel env vars (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
      anon key, service role key) pointed at it
- [ ] Auth → URL Configuration set fresh for `sparstrow.com` (does **not**
      inherit `staging`'s config — see `doc/runbooks/deploy-web-app.md`)
- [ ] Close `doc/Deferred.md` **D-15**

Everything in T-DR-01/02 works without this — stable's baked default
(`sparstrow.com`) is live in the code-path sense, but there's no database
behind it yet, unchanged from before this phase.
