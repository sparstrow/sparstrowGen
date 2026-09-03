/**
 * Where `server/` is.
 *
 * One place, so the answer cannot differ between the proxy and whatever else
 * comes to need it. The default is the loopback port `server/`'s own config
 * defaults to, which is what `pnpm dev:up` starts.
 *
 * `SPARSTROW_SERVER_URL` is the same variable the daemon and the desktop app
 * read (`server/src/config.ts`), deliberately: there is one API, and every
 * client should be pointed at it by one name. Which copy of `server/` that is —
 * one per machine, or one hosted somewhere — is `OQ-9`, still open.
 *
 * Server-side only. It is NOT a `NEXT_PUBLIC_` variable and must not become
 * one: the browser talks to this app's own `/api/v1`, never to `server/`
 * directly, because the session it would need lives in an httpOnly cookie.
 */
export function serverBaseUrl(): string {
  return (process.env.SPARSTROW_SERVER_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
}
