@AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ⛔ The rules that used to be in this file have been reversed

**2026-09-02.** This file previously said, in bold, **"A new write is a Server
Action. Always."** It also told you to query Supabase directly from `page.tsx`.

**Both are now forbidden.** See `AGENTS.md` §1 and the
[restructure plan](../../doc/plans/2026-09-02-multica-architecture-restructure.md).

This is the single most important correction in the repo, so it is worth stating
why rather than just what.

## What changed, and why

`apps/web` is no longer *the* app. It is one of three clients — web, desktop,
and later mobile — that all render the same `packages/views` components against
the same `packages/core` data layer, talking to one `server/`.

A **Server Action is only callable from inside a Next.js render.** So every write
built as a Server Action is a feature the desktop app and the mobile app can
never have. That is not a theoretical cost: the previous rule made `apps/web` the
only possible client, which forced the desktop app to ship a whole Next.js server
inside Electron alongside a second Node runtime and four native modules — and
that packaging problem is why the app was never once opened and used in five
months of work.

The same logic applies to querying Supabase from `page.tsx`. A page that talks to
the database directly is a page only this app can render.

## The rules now

- **Writes are HTTP routes in `server/`**, called through `packages/core`'s
  `ApiClient` via a TanStack Query mutation. Never a Server Action.
- **Reads are `packages/core` queries**, not direct Supabase calls and not
  `page.tsx` database access.
- **No file under `apps/web/src` imports `@supabase/*`** — except the auth
  callback, which is genuinely web-only. `server/` owns the database.
- **Feature UI lives in `packages/views`**, so desktop renders the same screen.
  `apps/web/src/app/<route>/page.tsx` becomes a thin shell: layout, metadata,
  and the view component.
- **`packages/ui` stays the design system** — `components/ui/*`, tokens, `cn()`.

**Streaming** still needs a route handler or WebSocket, as before — but it is now
the server-owned WebSocket in `packages/core`'s `WSClient`, not Supabase
Realtime.

## What you will find in the tree, and what to do about it

The 44 Server Actions across 18 `actions.ts` files are **not a pattern to
copy** — they are the thing being reversed. Restructure Phase 5 moves them into
`server/` one feature at a time, rejoining the route registry
(`src/lib/api/router.ts`, 71 routes across 19 handler modules) that was never
removed and still serves every read.

If you are touching a page that still uses a Server Action and your change is
small, leaving it is fine — the reversal is deliberately not on the critical
path. If you are adding a write, add it the new way.

**Do not restore the old rule** on the grounds that most of the code still
follows it. The old rule is why the code looks like that.

## The record of the decision this reverses

The previous rule came from `OQ-7`, answered by the owner on 2026-08-24 with
option A — convert everything now — over the recommended option C. That plan was
executed correctly and completely. What nobody drew at the time was the line
between "all writes are Server Actions" and "the desktop app cannot be built".
The full note is in the
[superseded plan](../../doc/plans/2026-08-24-server-action-write-conversion.md).
