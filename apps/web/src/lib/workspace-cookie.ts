/**
 * How **this client** remembers which workspace you last switched to.
 *
 * Split out of `lib/workspace.ts` by restructure Phase 1, when the resolver
 * itself moved to `server/src/routes/workspace-scope.ts`. The split is the
 * interesting part: deciding *which workspace a request acts in* is server
 * logic every client needs, but a cookie is one client's way of remembering a
 * preference. The desktop app will remember the same choice in its own storage
 * and send it as a header; nothing about that should require touching the
 * resolver.
 *
 * Written by the workspace switcher's action, read by the `/api/v1` adapter,
 * and always validated against real membership on the server before it is
 * believed — see `getActiveWorkspaceId`.
 */
export const WORKSPACE_COOKIE = "sparstrow.workspace";
