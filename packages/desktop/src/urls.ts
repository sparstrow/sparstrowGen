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
 * What the window loads, or `null` when nothing is configured.
 *
 * There is still deliberately no default production hostname — a default naming
 * a domain would turn "not configured" into a DNS error for a host the user
 * never chose. What changed in T-VR-01 is the *other* branch: unset used to
 * fall back to the local UI that core served, and core no longer serves one.
 * Falling back there now would load a bare 404 from the API, which is a worse
 * answer than saying plainly that no app URL is set. So unset is `null`, and
 * the caller shows a screen that says so.
 *
 * Whitespace-only is treated as unset: a `SPARSTROW_APP_URL=` line in an env
 * file is someone clearing the value, not asking to load the empty string.
 */
export function resolveAppUrl(env: UrlEnv, localPort?: number | null): string | null {
  const configured = env.SPARSTROW_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (localPort) return `http://127.0.0.1:${localPort}`;
  return null;
}

/** True when no app URL is configured — the window has nowhere to go. */
export function isUnconfigured(env: UrlEnv, localPort?: number | null): boolean {
  return resolveAppUrl(env, localPort) === null;
}
