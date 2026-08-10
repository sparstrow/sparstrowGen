# T-M2-03 — Catch-all route, dispatch table, middleware

| | |
|---|---|
| **Tag** | `[S]` sequential — gates every handler task |
| **Depends on** | T-M2-01, T-M2-02 |
| **Blocks** | T-M2-04, 05, 06, 07 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | queued |

## Objective

Stand up the single entry point that answers `/api/v1/*`, the registry handlers
plug into, and the middleware change that lets API routes reply with JSON instead
of redirecting to `/login`.

Ships with **zero resource handlers** — this task is the frame. Handlers arrive
in Band 3 and can then be built in parallel.

## Decisions already made

- **One catch-all, not ~95 route files.** 95 endpoints as nested directories is
  unmaintainable; the dispatch table is one readable file.
- **supabase-js with the caller's session — never Drizzle here.** Drizzle
  connects as the `postgres` role, which owns the tables and therefore
  **bypasses RLS entirely**, silently deleting the boundary M1 built. This is the
  single most important constraint in M2.
- **Unknown path → 404 JSON.** Known-but-unimplemented → 501 with a reason.

## Checklist

- [x] `apps/web/src/app/api/v1/[...path]/route.ts` exporting `GET`, `POST`,
      `PATCH`, `PUT`, `DELETE`
- [x] Each export resolves the Supabase server client from
      `apps/web/src/utils/supabase/server.ts`
- [x] Return `401 { error: "not authenticated" }` when there is no session
- [x] Resolve the workspace via `getActiveWorkspaceId`; propagate its 400 as-is
- [x] `apps/web/src/lib/api/router.ts` — ordered route table of
      `{ method, pattern, handler }`, matching `:param` segments
- [x] Handler context type: `{ supabase, workspaceId, params, searchParams, body }`
- [x] Response helpers: `ok(data)`, `noContent()` (204), `fail(status, message)`
- [x] Apply `toCamel` on the way out and `toSnake` on the way in, using
      `OPAQUE_COLUMNS` for the table being touched
- [x] Central error boundary: unhandled throw → `500 { error }`, logged server-side
- [x] Postgres error mapping: RLS denial / `42501` → 403, unique violation
      `23505` → 409, FK violation `23503` → 400
- [x] Edit `apps/web/src/middleware.ts` so paths under `/api/` skip the
      `/login` redirect and fall through to the route handler
- [x] `apps/web/src/lib/api/handlers/index.ts` — empty registry with a comment
      pointing at Band 3

## Why the middleware change matters

Today an unauthenticated API call gets a 302 to `/login`. `api()` in
`packages/ui/src/lib/api.ts` then tries to `res.json()` an HTML page and throws
`Request failed` with no useful detail. API routes must answer with a JSON 401 so
the UI can distinguish "signed out" from "broken".

## Verification

- [x] `pnpm --filter web typecheck` passes
- [x] `curl -i localhost:3000/api/v1/runs` while signed out → HTTP 401, JSON
      body, **no** `Location:` header
- [x] `curl -i localhost:3000/api/v1/nonsense` while signed in → HTTP 404 JSON
- [x] Signing in and hitting a registered-but-empty path returns 501 JSON, not a
      stack trace
