/**
 * The workspace-scoped HTTP API — 71 routes across 19 handler modules.
 *
 * This is the entry point a **host** imports: today `apps/web`'s
 * `/api/v1/[...path]` adapter, and from the next commit `server/cmd/server.ts`
 * running Fastify. Importing it registers every route as a side effect, which
 * is why `slug.ts` and `patch-validation.ts` were extracted out of the handler
 * modules long before this move — anything that only wants a pure helper must
 * not have to pull the registry in to get it.
 *
 * Nothing here imports a web framework. `HandlerContext` is a plain object and
 * every handler returns a platform `Response`, so a host's whole job is to
 * build the context, call `matchRoute`, and hand the `Response` back.
 *
 * ⚠️ Not to be confused with `server/src/api/routes/` — that is the **daemon's
 * own local API**, bound to loopback on a machine running agents, and served by
 * `cmd/daemon.ts`. Two route trees, two servers, two audiences: this one is the
 * cloud control plane every client talks to. `src/api/` moves under
 * `src/internal/` when the daemon is restructured.
 */
export {
  matchRoute,
  registerRoute,
  ROUTES,
  ok,
  noContent,
  fail,
  parseBody,
  handleError,
  type Handler,
  type HandlerContext,
  type RouteDefinition,
} from "./router";

export { getActiveWorkspaceId, type ActiveWorkspace } from "./workspace-scope";

// Side-effecting: every module below calls `registerRoute()` at module scope.
import "./handlers";
