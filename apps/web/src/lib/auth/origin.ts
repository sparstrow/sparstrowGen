/**
 * The origin to build post-auth redirects against.
 *
 * `new URL(request.url).origin` is the origin Next saw, which behind a proxy
 * (Vercel, a load balancer, the Electron shell's local server) is the internal
 * one -- often `http://localhost:3000` even in production. Redirecting there
 * sends the user to a host that only exists inside the datacentre.
 *
 * `x-forwarded-host` carries the real one, but it is a request header and so
 * attacker-controlled: on its own it turns every auth redirect into an open
 * redirect. Hence the order below -- an explicitly configured
 * `NEXT_PUBLIC_SITE_URL` always wins, and the header is only consulted in
 * production, where a proxy that overwrites it is what you are behind.
 *
 * Set NEXT_PUBLIC_SITE_URL in any deployment that sits behind a proxy.
 */
export function siteOrigin(request: Request, url: URL): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Misconfigured value -- fall through to the request-derived origin
      // rather than throwing inside an auth callback.
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${forwardedHost}`;
  }

  return url.origin;
}
