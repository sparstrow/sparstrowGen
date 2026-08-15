import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@web/utils/supabase/env";

/**
 * Routes reachable without a session.
 *
 * `/auth/*` is public as a whole because every entry point in it is the tail
 * of a flow that by definition runs while you are signed out: the OAuth
 * callback, the emailed confirm/recovery link, and the reset-password form you
 * land on from that link. Guarding them would deadlock -- you cannot sign in
 * without visiting the route that signs you in. Each one validates its own
 * token; being routable is not being authorised.
 */
function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not put anything between createServerClient and getUser(). getUser()
  // revalidates the token against Supabase and, when it refreshes, writes new
  // cookies through setAll above. Code that reads the session in between sees
  // a stale value and can trigger a random sign-out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // API routes authenticate themselves -- see apps/web/src/app/api/v1/[...path]/route.ts,
  // which calls getUser() and returns a 401 JSON body. They must NOT be
  // redirected here: an unauthenticated fetch() would follow the 302 to /login
  // and resolve with a 200 page of HTML, so the caller sees "success" and then
  // fails trying to parse it. A 401 is the honest answer to a program.
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Remember where they were headed so sign-in can put them back there
    // rather than dumping everyone on the dashboard.
    const intended = request.nextUrl.pathname + request.nextUrl.search;
    if (intended !== "/") url.searchParams.set("next", intended);
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}

/**
 * Carry any refreshed auth cookies onto the redirect we are returning instead.
 *
 * getUser() may have rotated the session, and those new cookies live on
 * `supabaseResponse` -- which we are about to throw away. Dropping them means
 * the browser keeps presenting the old refresh token, and on the next request
 * the rotation is detected as reuse and the session is revoked. The symptom is
 * being logged out at random, roughly one hour after signing in.
 */
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}
