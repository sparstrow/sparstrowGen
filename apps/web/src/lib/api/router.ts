import { SupabaseClient } from "@supabase/supabase-js";
import { toCamel, toSnake } from "../case";

/**
 * This registry deliberately depends on **no web framework at all** — the only
 * response type it knows is the platform `Response`.
 *
 * It used to return `NextResponse`, which was invisible as a constraint while
 * Next.js was the only host: 71 routes across 19 handler modules, every one of
 * them reachable solely from inside a Next render. Restructure Phase 1 re-hosts
 * these same handlers on Fastify in `server/` so desktop and mobile can call
 * them, and this line is what makes that an adapter swap instead of a rewrite.
 *
 * `Response` is not a downgrade. Next's own route-module validator
 * (`validateExecutionResponse`) accepts any `response instanceof Response`, and
 * `NextResponse` extends it — the two Next-only behaviours it gates on,
 * `NextResponse.rewrite()` and `.next()`, are both *forbidden* in an app route
 * handler anyway. Nothing here ever used them.
 *
 * Keep it that way: no `next/*` import belongs in this file or in any handler
 * module. `apps/web/src/app/api/v1/[...path]/route.ts` is the Next adapter and
 * is the only place that may know Next exists.
 */

export type HandlerContext = {
  supabase: SupabaseClient;
  workspaceId: string;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  body: any;
};

export type Handler = (ctx: HandlerContext) => Promise<Response> | Response;

export type RouteDefinition = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  pattern: string; // e.g., "/agents/:id/skills"
  handler: Handler;
  opaqueKeys?: string[];
};

export const ROUTES: RouteDefinition[] = [];

let matchOrder: RouteDefinition[] | null = null;

export function registerRoute(def: RouteDefinition) {
  // Two registrations of the same method+pattern silently shadow each other,
  // and which one wins depends on module import order. That is how a real
  // insert handler for POST /goals ended up masking its 501 stub.
  //
  // Replace rather than throw: ROUTES lives at module scope and survives HMR,
  // while the handler modules re-evaluate on every edit, so a dev-time reload
  // legitimately re-registers everything. Throwing there would wedge the whole
  // API after the first hot update. Replacing is idempotent under HMR and
  // still collapses a genuine cross-module clash to one entry -- the warning
  // is what surfaces that case.
  const clashAt = ROUTES.findIndex(
    (r) => r.method === def.method && r.pattern === def.pattern
  );

  if (clashAt !== -1) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[api] duplicate route ${def.method} ${def.pattern} -- replacing. ` +
          `If this is not an HMR reload, register it in exactly one module.`
      );
    }
    ROUTES[clashAt] = def;
  } else {
    ROUTES.push(def);
  }

  matchOrder = null; // invalidate; rebuilt lazily on next match
}

/**
 * Static segments must beat `:param` segments, or literal paths get swallowed
 * by the dynamic route registered before them: `/agents/imports` would match
 * `/agents/:id` and 404 as "no agent with id 'imports'". Registration order is
 * spread across several handler modules, so relying on it is not something a
 * reader could verify — order the routes explicitly instead.
 *
 * Fewer params wins first, then more segments, so `/tasks/attention/queue`
 * (0 params) outranks `/tasks/:id` (1 param) regardless of import order.
 */
function specificity(pattern: string) {
  const segments = pattern.split("/").filter(Boolean);
  const params = segments.filter((s) => s.startsWith(":")).length;
  return { params, depth: segments.length };
}

function orderedRoutes() {
  if (!matchOrder) {
    matchOrder = [...ROUTES].sort((a, b) => {
      const sa = specificity(a.pattern);
      const sb = specificity(b.pattern);
      if (sa.params !== sb.params) return sa.params - sb.params;
      return sb.depth - sa.depth;
    });
  }
  return matchOrder;
}

export function matchRoute(method: string, path: string): { route: RouteDefinition; params: Record<string, string> } | null {
  for (const route of orderedRoutes()) {
    if (route.method !== method) continue;

    const regexPattern = "^" + route.pattern.replace(/:([a-zA-Z0-9_]+)/g, "(?<$1>[^/]+)") + "$";
    const regex = new RegExp(regexPattern);
    const match = path.match(regex);

    if (match) {
      return {
        route,
        params: match.groups || {},
      };
    }
  }
  return null;
}

export function ok(data: any, opaqueKeys?: string[]) {
  return Response.json(toCamel(data, opaqueKeys));
}

export function noContent() {
  return new Response(null, { status: 204 });
}

/**
 * `reason` is a stable token the UI switches on; `message` is prose for a
 * human. M4 needs the distinction: "no machine is online" and "this machine
 * doesn't have that project" lead to completely different offers in the UI, and
 * matching on message text breaks the first time someone improves the wording.
 * This is the same rule /api/daemon/* has had since M3.
 */
export function fail(status: number, message: string, reason?: string) {
  return Response.json(reason ? { error: message, reason } : { error: message }, { status });
}

export function parseBody(rawBody: any, opaqueKeys?: string[]) {
  return toSnake(rawBody, opaqueKeys);
}

export function handleError(err: any) {
  console.error("API Route Error:", err);

  if (err && typeof err === "object" && err.code) {
    // PGRST116: `.single()` matched zero rows. That happens both when the id
    // does not exist and when RLS hid the row from this workspace, and those
    // two cases must be indistinguishable to the caller -- telling them apart
    // would confirm the existence of another workspace's records. Either way
    // the resource is not there for this user, which is a 404, not a 500.
    // Centralised here because ~50 handlers use .single().
    if (err.code === "PGRST116") return fail(404, "Not Found");
    // PGRST204 / 42703: the body referenced a column that does not exist. That
    // is a malformed request, not a server fault -- returning 500 made every
    // client-side typo look like an outage.
    if (err.code === "PGRST204" || err.code === "42703") {
      return fail(400, err.message || "Unknown field in request body");
    }
    if (err.code === "42501") return fail(403, "Forbidden by Row Level Security");
    if (err.code === "23505") return fail(409, "Resource already exists (unique violation)");
    if (err.code === "23503") return fail(400, "Invalid reference (foreign key violation)");
  }

  return fail(500, "Internal Server Error");
}
