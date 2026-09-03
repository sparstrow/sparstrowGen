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
  SPARSTROW_APP_URL?: string;
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
 * True when no app URL override is configured.
 *
 * This no longer means "the window has nowhere to go" — since Phase 3 the
 * window falls back to the SPA this app ships, which is the normal case. It
 * means only that no override was set.
 */
export function isUnconfigured(env: UrlEnv): boolean {
  return resolveAppUrl(env) === null;
}
