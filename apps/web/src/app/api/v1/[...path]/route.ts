import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@web/utils/supabase/server";
import { WORKSPACE_COOKIE } from "@web/lib/workspace-cookie";
import { serverBaseUrl } from "@web/lib/server-url";

/**
 * `/api/v1/*` — a proxy to `server/`.
 *
 * **This file no longer contains any API.** It used to be the host for the
 * 71-route registry; the registry now lives in `server/src/routes/` and is
 * served by `server/cmd/server.ts`, which the desktop and mobile apps call the
 * same way. What is left here is a translation between two things only the web
 * app has — a Supabase **cookie session** and a **cookie** naming the active
 * workspace — and the two things `server/` accepts from every client alike:
 *
 *   Authorization: Bearer <supabase access token>
 *   X-Sparstrow-Workspace: <workspace id>
 *
 * The path stays `/api/v1/*` so nothing in the browser had to change; the
 * fetches in `src/api/hooks.ts` are byte-identical to yesterday's.
 *
 * **Why proxy at all, rather than have the browser call `server/` directly?**
 * The session is an httpOnly cookie. The browser cannot read it to build an
 * Authorization header, and handing it a readable token instead would trade a
 * cookie XSS cannot reach for one it can. So the one hop stays until
 * `packages/core` owns the session for every client.
 *
 * `getSession()` rather than `getUser()` here is deliberate and is the one
 * place it is correct: we are not making a trust decision, we are fetching a
 * credential to forward. `server/` verifies it against Supabase on arrival.
 */

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

/** Hop-by-hop headers, plus the ones `fetch` must compute for itself. */
const STRIPPED = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

async function handleRequest(req: NextRequest, { params }: RouteContext) {
  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const resolvedParams = await params;
  const path = resolvedParams.path.map(encodeURIComponent).join("/");
  const target = new URL(`/api/v1/${path}`, serverBaseUrl());
  target.search = req.nextUrl.search;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("authorization", `Bearer ${session.access_token}`);

  let remembered: string | null = null;
  try {
    remembered = (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null;
  } catch {
    remembered = null;
  }
  if (remembered) headers.set("x-sparstrow-workspace", remembered);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      // `duplex` is required by undici whenever a request carries a stream
      // body; without it Node throws "RequestInit: duplex option is required".
      body: req.method === "GET" || req.method === "DELETE" ? undefined : req.body,
      ...(req.method === "GET" || req.method === "DELETE" ? {} : { duplex: "half" }),
      redirect: "manual",
      cache: "no-store",
    } as RequestInit);

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    // `server/` being down is the one new failure mode this proxy introduces,
    // and it must not read as an application bug. Name the cause and the fix,
    // because the symptom (every screen empty) looks identical to a data
    // problem and someone will otherwise go looking in the database.
    console.error(`[api/v1] cannot reach server/ at ${serverBaseUrl()}:`, err);
    return NextResponse.json(
      {
        error:
          `The API server is not reachable at ${serverBaseUrl()}. ` +
          `Start it with \`pnpm dev:up\` (which runs it alongside this app), or ` +
          `set SPARSTROW_SERVER_URL if it is running somewhere else.`,
        reason: "server_unreachable",
      },
      { status: 502 },
    );
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
