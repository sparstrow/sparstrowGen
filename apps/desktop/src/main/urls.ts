/**
 * Which URL the desktop window loads.
 *
 * Pulled out of `main.ts` so it can be tested: `main.ts` calls
 * `app.requestSingleInstanceLock()` at import time and cannot be loaded from a
 * test at all.
 *
 * The tray, the updater and the supervisor are NOT here. They resolve the local
 * core through their own constants (`core-client.ts`, `service-manager.ts`) and
 * must keep pointing at this machine's daemon no matter where the window points.
 */

export interface UrlEnv {
  /** Where the WEB app is. Sign-in opens its `/connect` confirm page. */
  SPARSTROW_APP_URL?: string;
  /** Debugging override: load this instead of the SPA this app ships. */
  SPARSTROW_WINDOW_URL?: string;
}

/**
 * The local daemon's address. Kept only so the "you have not configured an app
 * URL" screen can name it — the window never loads it. Before T-VR-01 core also
 * served the Vite UI here and this was a real fallback destination; it now
 * serves an API and nothing else.
 */
export const DEFAULT_CORE_URL = "http://127.0.0.1:48750";

/**
 * An OPERATOR'S OVERRIDE for what the window loads, or `null` for the normal
 * case.
 *
 * Restructure Phase 3 demoted this from "the only way the window finds a UI"
 * to "the way to point a build somewhere else". The window now ships its own
 * SPA (`out/renderer`) and falls back to it, so `null` is no longer a dead end
 * — it is what almost every build returns.
 *
 * There is still deliberately no default production hostname INVENTED IN
 * SOURCE: a literal baked into every build regardless would turn "not
 * configured" into a DNS error for a host the user never chose.
 *
 * Whitespace-only is treated as unset: a `SPARSTROW_APP_URL=` line in an env
 * file is someone clearing the value, not asking to load the empty string.
 */
export function resolveAppUrl(env: UrlEnv): string | null {
  const configured = env.SPARSTROW_APP_URL?.trim().replace(/\/+$/, "");
  return configured || null;
}

/**
 * A rare override for what the WINDOW loads, distinct from `SPARSTROW_APP_URL`.
 *
 * The two were briefly the same variable and that was a conflation, caught the
 * first time both were needed at once: setting the web app's address so
 * sign-in could find its confirm page ALSO repointed the window away from the
 * SPA it ships. They are different questions —
 *
 *   `SPARSTROW_APP_URL`    where the web app is (sign-in opens its /connect)
 *   `SPARSTROW_WINDOW_URL` load this instead of the bundled SPA (debugging)
 *
 * — and only the first one is ordinarily set.
 */
export function resolveWindowUrl(env: UrlEnv): string | null {
  const configured = env.SPARSTROW_WINDOW_URL?.trim().replace(/\/+$/, "");
  return configured || null;
}

/**
 * True when no app URL override is configured.
 *
 * This no longer means "the window has nowhere to go" — since Phase 3 the
 * window falls back to the SPA this app ships, which is the normal case. It
 * means only that no override was set.
 */
export function isUnconfigured(env: UrlEnv): boolean {
  return resolveAppUrl(env) === null;
}
