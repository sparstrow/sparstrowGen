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
transitional state (`doc/Deferred.md` D-25), and is **not a pattern to copy.**
The modules still stubbed in `src/lib/api/handlers/stubs.ts` — Terminals,
host-fs, project files, goals, agent draft and the rest — should each be built
the new way.

## Writes: every one of them, not just the new ones

**Decided by the owner on 2026-08-24 (`OQ-7`, option A).** The write rule above
is not aspirational and is not applied opportunistically: **every existing
`useMutation` + `router.refresh()` pair is being rewritten as a Server Action
with `revalidatePath`**, on every page, whether or not anything else is touching
that page. 98 mutation hooks across 28 files are in scope. The work is
[`doc/plans/2026-08-24-server-action-write-conversion.md`](../../doc/plans/2026-08-24-server-action-write-conversion.md).

Two things follow for anyone writing a write here:

- **A new write is a Server Action. Always.** There is no "but the page next to
  it does it the old way" exception any more — that exception is exactly what
  option A was chosen to remove.
- **If you find a `useMutation` still in place, it is a not-yet-converted one,
  not a precedent.** `T-VR-05` left `teams`' create button on the old pattern
  as a deliberate scope call; it is a leftover, and it is on the conversion
  list like everything else.

The owner chose this over converting opportunistically (option C, which the
question recommended) with the cost stated: ~20 pages of rewrite that no user
will ever see the result of. That cost was accepted deliberately — do not
re-litigate it in a task, and do not quietly narrow the scope back to C.
