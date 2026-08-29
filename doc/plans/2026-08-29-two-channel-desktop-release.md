# Two-channel desktop release — 2026-08-29

| | |
|---|---|
| **Spec** | n/a (internal) — build/release infrastructure. The one user-facing piece (the `/changelog` page) was scoped and approved in-chat on 2026-08-29 with the owner via a rendered walkthrough and four explicit decisions (app identity, publish gate, code signing timing, prod DB timing), not a separate spec document. |
| **Status** | In progress — Band A, B and the database half of Band C landed 2026-08-29; Vercel env vars + Supabase Auth URL Configuration for `main` still need the owner (dashboard/CLI actions this agent can't do unilaterally) |
| **Trigger** | Owner: "I want two things set up — a test electron app on staging + staging DB, and a prod electron app on main + a separate prod DB... I am also expecting this changelog for user facing in the app," 2026-08-29, after hitting the Vercel free-tier limit and asking how Multica does desktop updates/releases. |
| **Depends on** | — |
| **Touches** | `packages/desktop/`, `.github/workflows/release.yml`, `.github/workflows/release-staging.yml`, `apps/web/src/app/changelog/`, `apps/web/src/lib/changelog.server.ts`, `apps/web/src/content/changelog/`, `apps/web/src/components/update-banner.tsx`, `apps/web/src/app/settings/`, `.claude/skills/release/` |
| **Tasks** | `doc/tasks/DR/` (Band A + B only — see note below on why the queue isn't regenerated) |
| **Open questions** | none — the four decisions below were resolved in-chat before any code was written |

## Summary

Splits the Electron desktop app into two channels that coexist on one machine:
**Sparstrowgen** (stable), which tracks `main`/production and ships via a
tag-then-manual-publish gesture unchanged from before, and **Sparstrowgen
Staging**, which tracks the `staging` branch and auto-publishes a new
installer on every push — no manual step. Adds an in-app `/changelog` page
(one per release, both channels, newest first) that the desktop update
notification links straight to, mirroring the pattern in Multica's own
open-source desktop app (electron-updater + GitHub Releases + a hand-written
changelog).

## What the request asks for that isn't obvious

"A test electron app on staging DB and a prod electron app on a separate prod
DB" sounds like two independent asks, but the DB half and the channel half
have very different amounts of work behind them. The channel half —
electron-updater already existed, notify-only, in `packages/desktop/`; making
it multi-channel is mostly plumbing (see Decisions). The DB half is not
plumbing: `main` has **no Supabase project at all today** — `staging` and
`development` share one project deliberately, and `main` was left pointed at
a placeholder on purpose, tracked as `doc/Deferred.md` **D-15**, pending the
owner creating a fresh production project. That's real infrastructure with a
real decision behind it, not something this plan can build around.

## Work breakdown

All of this is foundational (build/release tooling and process; nobody "opens
and uses" a GitHub Actions workflow) except the changelog page, which the
owner can open today.

### Foundational — blocks all stories

| Work | Why no story owns it |
|---|---|
| Baked per-channel default backend URL (`channel.ts`, `urls.ts`, `packaged-env.ts`) | Build-time config, invisible to the person using the app |
| Two electron-builder identities from one config (`build-channel-config.mjs`) | Packaging mechanics |
| `release-staging.yml` (auto-publish on push to `staging`) | CI pipeline |
| `preload.ts` version-reporting fix | Bug fix underneath the changelog's version display |
| `/release` skill | Agent/operator tooling, not product surface |

### Per story

| Story | Work | Delivers |
|---|---|---|
| "See what changed before I update" | `/changelog` route + `changelog.server.ts` + seed entry + update-banner deep link + Settings link + Knowledge Center article | A page the owner can open today, and a link from the update prompt into the exact entry for the version being offered |

## Decisions

**Two separate app identities, not a channel toggle in one install.** A
shared appId means a bad staging build and the production install share one
userData dir and one Start Menu entry — a staging regression could take down
the app the owner actually relies on. Separate `appId`/`productName`
(`com.sparstrow.sparstrowgen` vs `com.sparstrow.sparstrowgen.staging`) gives
each its own userData dir for free (Electron derives it from `productName`)
and lets them install side by side. Confirmed with the owner 2026-08-29.

**The backend URL is baked per-channel at build time, not read from a
machine-wide env var.** `urls.ts` had a deliberate, tested "no default
hostname" rule from T-VR-01 — reversing it outright would have been a real
regression, not a refinement. What's actually different here is that a
**channel-aware build knows its own target**, because the pipeline that
produced that specific installer set it; `resolveAppUrl` was narrowed (not
reversed) to accept that as a second-priority fallback behind the existing
env var override, and the "dev / no baked resource" case is byte-for-byte
unchanged (`urls.test.ts` asserts this explicitly). A plain machine-wide env
var was rejected outright: since both channels would read the same
`SPARSTROW_APP_URL`, installing one would silently repoint the other. The
baked value lives inside each install's own `resourcesPath` instead —
`channel.json`, written by `prepare-resources.mjs` — so the two channels can
never collide, and `SPARSTROW_CLOUD_URL` gets the same treatment for the
daemon's report-to target (`packaged-env.ts`, `??=` so an operator's explicit
override still wins, unchanged from the existing pattern there).

**Staging auto-publishes non-draft; stable keeps its manual-publish click.**
electron-builder's default `releaseType` leaves a published release as an
empty draft — exactly right for stable, exactly wrong for staging, where the
entire point is "push and it's out." The asymmetry is deliberate, not an
oversight: stable's click is the actual release gate (nothing between a
publish and a user's machine); staging's review checkpoint already exists one
level up, at the `staging` → `main` promotion the owner reviews per
`AGENTS.md` §2 rule 8. Confirmed with the owner 2026-08-29 (over a "manual
approve deployment" alternative).

**Unsigned installers for now.** Both channels ship without a code-signing
certificate — Windows SmartScreen / macOS Gatekeeper will warn on install.
Confirmed with the owner 2026-08-29 as a deliberate cost/timing call, not an
oversight; revisit when that changes.

**Changelog is hand-authored markdown, not generated from commits.**
`release.yml` already auto-generates raw release notes from merged PRs via
`gh api .../releases/generate-notes` — that stays a private draft aid for the
GitHub Release body, not the public copy. The changelog page reads
`apps/web/src/content/changelog/*.md`, same file-based pattern as the
Knowledge Center, because release notes are product copy written for the
person reading them, not a commit log.

## Phases

### Band A — Desktop channel infrastructure (foundational) ✅ DONE 2026-08-29

`channel.ts` (+ tests), `urls.ts`/`urls.test.ts` narrowed per the Decision
above, `packaged-env.ts` threading `SPARSTROW_CLOUD_URL`, `updater.ts` setting
`autoUpdater.channel`, `preload.ts` version fix via `additionalArguments`,
`prepare-resources.mjs` baking `channel.json`, `build-channel-config.mjs`
generating the per-channel electron-builder config, `release-staging.yml`.
`pnpm typecheck && pnpm test` green (40/40 desktop tests).

### Band B — Changelog page (serves the changelog story) ✅ DONE 2026-08-29

`/changelog` route, `changelog.server.ts`, one seed entry, `update-banner.tsx`
deep link, a small link from Settings' version row, and the Knowledge Center
article (`updates-and-releases.md`) per `AGENTS.md` §3.2.

### Band C — Production database cutover ✅ database half done 2026-08-29, Vercel/Auth remain

The owner created `sparstrowgen-prod` (`styichgxhecmatkholvi`) directly and
authorized the Supabase MCP connection mid-session. Replayed the full schema
(8 drizzle table migrations + 27 RLS/policy files, in order) onto it from
empty — not the stale `apply-to-supabase.sql` snapshot. `list_tables` /
`get_advisors` confirm exact parity with staging (39 tables, same accepted
advisor findings). Found and fixed three real bugs along the way, all
documented and applied to both databases where applicable:

- `doc/bug/BUG-2026-08-29-bootstrap-workspace-020-reverted-012.md` — `020`
  silently reverted `012`'s no-invented-names fix; live on staging since
  2026-08-28, fixed on both projects.
- `doc/bug/BUG-2026-08-29-missing-migration-files-for-two-live-tables.md` —
  `chat_message_attachments` had no creating migration anywhere; added
  `0008_*.sql` via `drizzle-kit generate` (tool-authored, not hand-written).
- `doc/security/SEC-2026-08-29-record-provider-models-anon-executable-on-fresh-project.md`
  — prod's newer project template grants function EXECUTE to `anon`/
  `authenticated` more broadly than staging's; `record_provider_models` and
  `rls_auto_enable()` were anon-callable until fixed.

**Still needs the owner** (not something this agent can do unilaterally):
Vercel env vars for `main` (`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) and Supabase
Auth → URL Configuration for the new project (Site URL `sparstrow.com`,
redirect URLs) — no MCP tool covers Auth config, and the DB password/service
role key are secrets that should go directly from the owner into Vercel, not
through chat. Closes `doc/Deferred.md` **D-15** once those land.

## Scope boundaries

- **Code signing** — explicitly deferred by owner decision, not built. Revisit
  as its own piece of work when the owner decides to invest in it.
- **Auto-generating changelog entries from commits/PRs** — rejected in
  Decisions above; stays hand-authored.
- **MasterTaskQueue.md was not regenerated.** `doc/tasks/README.md` /
  `AGENTS.md` §2 rule 9 requires decomposing into the queue to be a solo
  operation with zero open task/band branches — several were open when this
  landed (`band/25-di-daemon-identity`, `band/26-chat-session-and-conversation-ux`,
  and multiple `task/T-*` branches). `doc/tasks/DR/` exists as the task record
  for this work; inserting it into the queue proper is deferred until the
  queue next drains to zero open branches.

## Verification

| What | How it got checked |
|---|---|
| Desktop channel logic (URL resolution, channel config parsing) | `pnpm --filter @sparstrow/desktop test` — 40/40 passing, including new `channel.test.ts` and the added `urls.test.ts` cases |
| Whole-repo typecheck | `pnpm typecheck` — clean |
| Whole-repo tests | `pnpm test` — clean |
| Two installers actually installing side by side and updating independently | **Not run** — no Windows machine available in this session to install and exercise real NSIS builds. See `doc/KnownGaps.md`. |
| `/changelog` page rendering in a browser | **Not run in this pass** — see `doc/KnownGaps.md`. |

## Result

Bands A and B shipped: the desktop app's channel machinery, the
`release-staging.yml` auto-publish pipeline, the `/changelog` page, and the
`/release` skill. Band C's database half also shipped, once the owner created
the production Supabase project mid-session and authorized the MCP
connection: the full schema (39 tables) now exists on `sparstrowgen-prod`
with the same RLS/policy shape as staging, verified via `list_tables` and
`get_advisors`. Only the Vercel/Auth dashboard steps remain, and they're
owner-only by nature (secrets, no MCP coverage for Auth config).

What the plan didn't anticipate, twice over. First: `urls.ts`'s existing "no
default hostname" rule (from T-VR-01) was strict enough that reproducing the
original planned mechanism (a runtime env var baked via the NSIS installer)
would have broken the two-channel coexistence goal outright — a machine-wide
env var can't tell two installs apart. The per-install `resourcesPath`
resource turned out to be the only mechanism compatible with both "installers
coexist" and "no invented hostname in source." Second, and far larger:
building the production database from scratch by replaying history — rather
than trusting a snapshot file or assuming staging's current state was
correct — surfaced three real, live defects that a same-environment change
would never have exposed: a silently-reverted bugfix, two tables with no
recorded migration, and a Supabase project-template security gap. All three
are now fixed on both databases (where applicable) and documented. The
general lesson, worth remembering for any future fresh-environment setup in
this repo: replaying the full migration history from empty is itself a
verification pass, and it found more than the plan asked it to look for.
