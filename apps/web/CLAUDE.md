@AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## New surfaces are Server Components

Build new routes in the App Router idiom, not the transitional one:

- `page.tsx` is a Server Component. Do the auth check and the data query there,
  against Supabase directly — not via `fetch` to our own `/api/v1`.
- Push `"use client"` down to the smallest interactive island.
- Ordinary writes are Server Actions with `revalidatePath`, not a POST to
  `/api/v1` followed by a React Query invalidation.
- Page components live in `apps/web/src/app/<route>/`, not in `packages/ui`.
  `packages/ui` is the design system: `components/ui/*`, tokens, `cn()`.

**Exception — streaming.** Server Actions do not stream. A live byte stream (a
terminal, a run transcript) needs a route handler or WebSocket. Using one is
not a violation of the above.

The ~25 existing pages do **not** follow this yet — they re-export client
components from `packages/ui` and fetch via React Query. That is a known
transitional state (`doc/Deferred.md` D-25), converted per-route, and is **not
a pattern to copy.** The modules still stubbed in
`src/lib/api/handlers/stubs.ts` — Terminals, host-fs, project files, goals,
agent draft and the rest — should each be built the new way.
