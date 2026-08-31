# Worktree Port Registry

Source of truth for which port belongs to which worktree/branch. **Read this
before allocating a port for a new worktree's dev server; update it in the
same change that adds or removes a `.claude/launch.json` preset.** A stale row
here is exactly as misleading as a stale `launch.json` entry — don't let it
drift.

## Web (Next.js `apps/web`) — fixed pool, Supabase-constrained

`apps/web`'s Supabase project has a static Auth **Redirect URLs** allow-list
(dashboard → Authentication → URL Configuration). Email confirmation, magic
link, and password reset flows only work if the port they redirect to is in
that list — Supabase does not support wildcarding the port number, so this
pool is deliberately a **fixed, pre-registered set**, not "any free port."
Assigning a `web` worktree a port outside this table means its auth redirects
silently bounce to the Site URL instead of back to the worktree — looks like a
fresh bug, isn't one (see `doc/bug/BUG-2026-08-16-signup-auto-confirms.md` for
what that confusion actually looks like in practice).

Allow-listed in the Supabase dashboard as of 2026-08-16: `3000`, `3010`,
`3020`, ... `3100` (step 10, 11 rows total). `3000` stays reserved for the
main checkout — never assign it to a worktree.

**A band in flight consumes several rows at once.** Under `AGENTS.md` §2.2 a
band branch and each of its parallel task worktrees are separate directories,
so each needs its own port if it runs a dev server — a 6-task band fanned out
across forked sessions can hold 4–5 rows simultaneously. Ten usable ports
covers one band comfortably and two only if neither is fully fanned out.
**Release a task's port the moment its worktree is removed** (task → band
merge), rather than at the end of the band; that is what keeps the pool from
running dry mid-band. If it does run dry, this is the row that reopens the
owner-action in [`doc/runbooks/README.md`](../../../../doc/runbooks/README.md)
for allow-listing the next range — don't quietly assign an unlisted port.

| Port | Status | Branch | Worktree | Assigned |
|---|---|---|---|---|
| 3000 | 🔒 reserved | — | main checkout (no worktree) | — |
| 3010 | 🔒 locked | `feature/supabase-email-delivery` | `.claude/worktrees/supabase-email-delivery` | 2026-08-16 |
| 3020 | 🔒 locked | `task/T-DI-05-live-verification` | `.claude/worktrees/di-live-verification` | 2026-08-28 |
| 3030 | 🔒 locked | `claude/feedback-spec-plan-tasks-2c5017` | `.claude/worktrees/feedback-spec-plan-tasks-2c5017` | 2026-08-29 |
| 3040 | 🔒 locked | `task/T-WA-08-settings-machines` | `.claude/worktrees/task-T-WA-08-settings-machines` | 2026-08-26 |
| 3050 | 🔒 reserved | — | desktop channel local dev — `stable` (see below) | 2026-08-30 |
| 3060 | 🔒 reserved | — | desktop channel local dev — `staging` (see below) | 2026-08-30 |
| 3070 | 🔒 locked | `task/browser-loopback-pairing` | `.claude/worktrees/browser-loopback-pairing` | 2026-08-31 |
| 3080 | 🟢 available | — | — | — |
| 3090 | 🟢 available | — | — | — |
| 3100 | 🟢 available | — | — | — |

**3050/3060 are not worktree-assignable** — they're a permanent reservation
for `packages/desktop/scripts/run-local.mjs` (see below), same non-worktree
pattern as the Core/UI ports further down. Don't hand either out to a
worktree even if the row above ever looks stale; check
`packages/desktop/scripts/run-local.mjs`'s `PORTS` map first.

**Pool exhausted (all 10 assignable rows locked)?** Add more rows to the
Supabase dashboard allow-list first (same `http://localhost:<port>/**`
pattern, next step of 10), then add matching rows here. Adding the dashboard
rows is an owner action — see `doc/runbooks/README.md`.

## Desktop channel local dev — `3050` (stable), `3060` (staging)

Added 2026-08-30 while Vercel's free-plan usage cap left every hosted
environment (`sparstrow.com`, `staging.sparstrow.com`, `development.sparstrow.com`)
paused — see `doc/KnownGaps.md` **G-54**. The installed desktop app's default
`appUrl` per channel is the hosted one; pointing it at a local `apps/web dev`
server instead (via `SPARSTROW_APP_URL`) is the workaround, and each channel
needs its own fixed port so both can run side by side without colliding —
same reasoning as the Web pool above, and for the same reason these two also
have to come from that Supabase-allow-listed range, not an arbitrary unused
port: a local sign-in/magic-link/reset flow bounces to the Site URL instead
of back to the app on any port not in that allow-list.

`packages/desktop/scripts/run-local.mjs <stable|staging>` reads these from
its own `PORTS` map (not from this file — this table is the change-control
record, the script is the source of truth at runtime) and: starts
`apps/web`'s dev server on the channel's port if nothing is already listening
there, waits for it to respond, then launches the channel's installed app
with `SPARSTROW_APP_URL` pointed at it. See the script's own header comment
for the full behavior and `doc/runbooks/deploy-web-app.md` for when this
workaround can be retired (once G-54 clears).

## Core / UI (`@sparstrow/core`, `@sparstrow/ui`) — singleton, no worktree pool

There is no per-worktree isolated copy of the Electron desktop app. `48750` (core)
and `5173` (ui) belong to the single always-on packaged app in the main checkout —
reserved, not assignable.

| Port | App | Status | Branch | Worktree | Assigned |
|---|---|---|---|---|---|
| 48750 | core | 🔒 reserved | — | main checkout (always-on packaged app) | — |
| 5173 | ui | 🔒 reserved | — | main checkout (packaged app default) | — |

A `dev-preview` mechanism used to let a worktree spin up its own isolated core/ui
instance (ports `48751`+); it was removed 2026-08-16 once agent testing moved to
`apps/web` instead. Details and how to rebuild it if ever needed again:
[references/port-isolation.md](port-isolation.md)'s "What used to be here" section.

## Allocation procedure — do this, not "pick a number that looks free"

1. Open this file, find the first `🟢 available` row in the web table.
2. Edit that row in place: `🟢 available` → `🔒 locked`, fill in branch,
   worktree path, today's date.
3. Add a `wt-<short-id>-web` preset to `.claude/launch.json` using that exact
   port (see existing `wt-sed-web` entry as the template).
4. Copy `apps/web/.env.local` into the new worktree — `.env*` files are
   gitignored and don't come along with `git worktree add`.

**Editing `.claude/launch.json` and this registry from inside a worktree
session:** both live at the **repo root**, and a worktree-isolated session is
blocked from writing outside its own worktree (by design — prevents one
worktree's session from corrupting another's config). Use `ExitWorktree`
(`action: "keep"`) first, make the edit from the root checkout, then
`EnterWorktree` with `path` set to the worktree to go back in.

## Release (when a worktree is cleaned up)

Per this skill's merge/cleanup sequence in `SKILL.md`: once the PR is
confirmed merged and the worktree is removed, flip its row back to `🟢
available`, blank the branch/worktree/date columns, and delete its preset
from `.claude/launch.json` in the same pass. Do this as part of the existing
"sweep for worktrees left behind after merge" habit — don't treat it as a
separate chore that can be skipped.
