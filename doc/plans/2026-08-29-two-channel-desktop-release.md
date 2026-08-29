# Two-channel desktop release — 2026-08-29

| | |
|---|---|
| **Spec** | n/a (internal) — build/release infrastructure. The one user-facing piece (the `/changelog` page) was scoped and approved in-chat on 2026-08-29 with the owner via a rendered walkthrough and four explicit decisions (app identity, publish gate, code signing timing, prod DB timing), not a separate spec document. |
| **Status** | In progress — Band A and B landed; Band C blocked on the owner creating the production Supabase project (see Decisions) |
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

### Band C — Production database cutover (foundational, blocked)

Create the production Supabase project (owner-approved 2026-08-29 as
"create it now," but the Supabase MCP connection in this session was not
authorized — needs the owner to authorize it or create the project by hand),
point `main`'s Vercel env vars + Auth redirect config at it fresh (per
`doc/runbooks/deploy-web-app.md`'s "it starts from scratch" note), close
`doc/Deferred.md` **D-15**. Not started.

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
`/release` skill. Band C (the actual production database) is blocked on the
owner authorizing the Supabase MCP connection or creating the project by hand
— nothing in Band A/B required it, by design, so stable's baked default
(`sparstrow.com`) is live in the sense that the code path exists, but there is
no database behind it yet, unchanged from before this plan.

What the plan didn't anticipate: `urls.ts`'s existing "no default hostname"
rule (from T-VR-01) was strict enough that reproducing the original planned
mechanism (a runtime env var baked via the NSIS installer) would have broken
the two-channel coexistence goal outright — a machine-wide env var can't tell
two installs apart. The per-install `resourcesPath` resource turned out to be
the only mechanism compatible with both "installers coexist" and "no invented
hostname in source."
