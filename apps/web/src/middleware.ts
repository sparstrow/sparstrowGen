import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@web/utils/supabase/middleware";
import { MissingConfigError } from "@web/utils/supabase/env";

/**
 * The matcher below covers every route, so anything thrown here takes the whole
 * deployment down — every page and every API route, including `/login`, with a
 * platform-level crash and no indication of the cause.
 *
 * That is the right outcome for an unexpected failure and the wrong one for a
 * deployment that was simply never configured: a missing environment variable
 * is a five-second fix that presents as a total outage with no message. On
 * Vercel it is also easy to cause by accident, because Preview and Production
 * environments are configured separately and a variable set only for Production
 * leaves every preview deployment dead on arrival.
 *
 * So: a `MissingConfigError` becomes a legible 503 naming the variable.
 * Everything else is re-thrown untouched — this must never become a catch-all
 * that turns a real bug into a tidy error page.
 */
export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (error) {
    if (!(error instanceof MissingConfigError)) throw error;

    const body = {
      error: "This deployment is not configured.",
      variable: error.variable,
      detail: error.message,
    };

    // JSON for programs, plain text for people. An API caller that got HTML
    // here would fail parsing it and report something unrelated — the same
    // reasoning that keeps `/api/` out of the login redirect below.
    const wantsJson =
      request.nextUrl.pathname.startsWith("/api/") ||
      (request.headers.get("accept") ?? "").includes("application/json");

    return wantsJson
      ? NextResponse.json(body, { status: 503 })
      : new NextResponse(`${body.error}\n\n${error.message}\n`, {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
