/**
 * Where a post-auth redirect is allowed to land.
 *
 * The OAuth callback and the login page both take a `next` parameter so you
 * come back to the page you were trying to reach. That parameter is attacker
 * controllable: anyone can send a victim a link to our own callback carrying
 * `?next=https://evil.example/harvest`. Without a check the app would happily
 * bounce them off-site straight after a successful sign-in, which is the
 * classic open-redirect phishing setup -- the domain in the address bar is
 * genuinely ours right up until the moment it isn't.
 *
 * So: same-origin paths only, and they must look like paths.
 */

const DEFAULT_DESTINATION = "/";

export function safeRedirectPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_DESTINATION;

  // Must be site-root-relative. This rejects "https://evil.example/x" and,
  // importantly, "//evil.example/x" -- a protocol-relative URL that every
  // browser treats as absolute while a naive `startsWith("/")` check waves
  // through. `\\evil.example` is the same trick with backslashes, which some
  // browsers normalise to forward slashes.
  if (!next.startsWith("/")) return DEFAULT_DESTINATION;
  if (next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_DESTINATION;

  // Never bounce back into the auth pages: landing on /login after a
  // successful sign-in just gets bounced again by the middleware, and
  // /auth/* endpoints are not pages at all.
  if (next.startsWith("/login") || next.startsWith("/auth/")) return DEFAULT_DESTINATION;

  return next;
}
