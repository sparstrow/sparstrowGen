# Port isolation for worktree dev servers

## Why this is a fixed pool, not "any free port"

`apps/web` (Next.js) is a special case for port assignment. Its port isn't just
"must not collide with something else" — it must be one Supabase's Auth Redirect
URLs allow-list already knows about, because `emailRedirectTo`/`redirectTo` in
`apps/web/src/app/login/page.tsx` resolves to `window.location.origin` — whatever
port the browser is actually on. Supabase does not support wildcarding the port
number in an allow-list entry. A port outside the allow-list doesn't error; Supabase
silently redirects to the Site URL instead, which reads as a broken confirmation
link rather than a config gap (see `doc/bug/BUG-2026-08-16-signup-auto-confirms.md`
for what that confusion actually looks like in practice).

So the pool of usable worktree ports is deliberately fixed and pre-registered, not
"pick the next free number." Source of truth for the pool and current
lock/release status is [references/port-registry.md](port-registry.md).

## Allocating a `web` port for a new worktree

1. Read [references/port-registry.md](port-registry.md)'s web table, take the first
   `🟢 available` row, lock it (branch, worktree path, date).
2. Add a `wt-<short-id>-web` preset to `.claude/launch.json`, e.g.:
   ```json
   {
     "name": "wt-<short-id>-web",
     "runtimeExecutable": "node",
     "runtimeArgs": [
       "-e",
       "const wt='<absolute worktree path>\\\\apps\\\\web';process.env.PORT='<port>';require('child_process').spawn('pnpm',['dev'],{cwd:wt,stdio:'inherit',shell:true,env:process.env}).on('exit',c=>process.exit(c??0))"
     ],
     "port": <port>
   }
   ```
3. Copy `apps/web/.env.local` into the new worktree — it's gitignored and
   `git worktree add` won't bring it along.
4. If the fixed pool is exhausted, more rows need adding to the Supabase dashboard
   allow-list first (owner action, `doc/runbooks/README.md`) before extending the
   registry table.

## Releasing a port

When a worktree is cleaned up (`SKILL.md`'s merge/cleanup sequence), flip its
registry row back to `🟢 available`, blank the branch/worktree/date columns, and
delete its preset from `.claude/launch.json` in the same pass. A registry row or
`launch.json` preset for a worktree that `git worktree list` no longer shows is
drift — the whole point of the registry is to make that visible instead of silent.

## Editing `.claude/launch.json` and the registry from inside a worktree session

Both live at the **repo root**, and a worktree-isolated session is blocked from
writing outside its own worktree (by design — prevents one worktree's session from
corrupting another's config). Use `ExitWorktree` (`action: "keep"`) first, make the
edit from the root checkout, then `EnterWorktree` with `path` set to the worktree to
go back in.

## What used to be here

Earlier versions of this doc also covered isolating `@sparstrow/core`/`@sparstrow/ui`
(the Electron desktop app) per worktree via a `dev-preview.mjs` launcher and
`SPARSTROW_PORT`/`SPARSTROW_DATA_DIR` env vars, so agents could test the desktop UI
without colliding with the always-on packaged app on `48750`. That mechanism was
removed 2026-08-16 once testing shifted to `apps/web` instead — the always-on app at
`48750`/`5173` remains a singleton with no per-worktree isolated copy. If desktop-UI
preview testing is needed again later, `SPARSTROW_PORT`/`SPARSTROW_DATA_DIR` support
still exists in `packages/core`, `packages/ui`, and `apps/desktop` — only the
convenience launcher and worktree-scoping pattern were removed; rebuild from git
history (`scripts/dev-preview.mjs`, pre-2026-08-16) rather than from scratch.
