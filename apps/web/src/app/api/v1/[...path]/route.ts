import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@web/utils/supabase/server";
import { getActiveWorkspaceId } from "@web/lib/workspace";
import { matchRoute, fail, parseBody, handleError, HandlerContext } from "@web/lib/api/router";
import "@web/lib/api/handlers";

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
    const wsRes = await getActiveWorkspaceId(supabase, searchParams);
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
