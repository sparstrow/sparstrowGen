import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@web/utils/supabase/server";
import { WORKSPACE_COOKIE } from "@web/lib/workspace-cookie";
import {
  matchRoute,
  fail,
  parseBody,
  handleError,
  getActiveWorkspaceId,
  type HandlerContext,
} from "@sparstrow/server/routes";

/**
 * The Next.js adapter for `server/`'s route registry.
 *
 * **This file is the only place in `apps/web` that knows Next.js exists AND
 * knows about the API.** Everything it calls below lives in `server/` and is
 * framework-free, which is the whole point: `server/cmd/server.ts` builds the
 * same `HandlerContext` from a Fastify request and gets the same `Response`
 * back.
 *
 * ⚠️ **Transitional.** Importing `@sparstrow/server/routes` in-process is a
 * dependency pointing the wrong way — a client reaching into the server — and
 * it exists for exactly one commit. The next one starts `server/` as its own
 * process and turns this file into an HTTP proxy, at which point the
 * `@sparstrow/server` dependency comes back out of `apps/web/package.json`.
 * The subpath (`/routes`, not the package root) is what keeps this survivable
 * meanwhile: the root export pulls the daemon in, along with `better-sqlite3`,
 * `node-pty` and `fastembed`, and Next cannot bundle those.
 *
 * Two things the adapter owns, because they are genuinely web-specific:
 *   1. the **session** — a Supabase cookie session, read via `@supabase/ssr`
 *   2. the **remembered workspace** — a cookie the switcher writes
 * A desktop client will supply both differently (a bearer token and a stored
 * preference), which is why neither is the registry's business.
 */

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function handleRequest(req: NextRequest, { params }: RouteContext) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return fail(401, "not authenticated");
    }

    const searchParams = req.nextUrl.searchParams;

    // Read here rather than inside the resolver: `cookies()` throws outside a
    // Next request context, and the resolver is now called from Fastify too.
    let rememberedWorkspaceId: string | null = null;
    try {
      rememberedWorkspaceId = (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
    } catch {
      rememberedWorkspaceId = null;
    }

    const wsRes = await getActiveWorkspaceId(supabase, searchParams, rememberedWorkspaceId);
    if (wsRes.error || !wsRes.workspaceId) {
      return NextResponse.json(wsRes, { status: wsRes.status || 400 });
    }

    const method = req.method;
    const resolvedParams = await params;
    const pathString = "/" + resolvedParams.path.join("/");

    const match = matchRoute(method, pathString);
    if (!match) {
      return fail(404, "Not Found");
    }

    let body = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      try {
        const rawBody = await req.json();
        body = parseBody(rawBody, match.route.opaqueKeys);
      } catch (e) {
        // body could be empty or invalid JSON
      }
    }

    const ctx: HandlerContext = {
      supabase,
      workspaceId: wsRes.workspaceId,
      params: match.params,
      searchParams,
      body,
    };

    return await match.route.handler(ctx);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}
export async function POST(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}
export async function PUT(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return handleRequest(req, ctx);
}
