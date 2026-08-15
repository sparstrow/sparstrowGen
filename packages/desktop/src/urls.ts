/**
 * Which URL the desktop window loads.
 *
 * Pulled out of `main.ts` so it can be tested: `main.ts` calls
 * `app.requestSingleInstanceLock()` at import time and cannot be loaded from a
 * test at all. The claim that matters — "a build with SPARSTROW_APP_URL unset
 * behaves exactly as it did before M7" — is the kind that is easy to assert in a
 * comment and easy to get wrong in code, so it is a test instead.
 *
 * The tray, the updater and the supervisor are NOT here. They resolve the local
 * core through their own constants (`core-client.ts`, `service-manager.ts`) and
 * must keep pointing at this machine's daemon no matter where the window points.
 */

export interface UrlEnv {
  SPARSTROW_DEV?: string;
  SPARSTROW_UI_URL?: string;
  SPARSTROW_CORE_URL?: string;
  SPARSTROW_APP_URL?: string;
}

export const DEFAULT_DEV_UI_URL = "http://127.0.0.1:5173";
export const DEFAULT_CORE_URL = "http://127.0.0.1:48750";

/** The UI this machine serves itself — Vite in dev, core's bundled build otherwise. */
export function resolveLocalUiUrl(env: UrlEnv): string {
  return env.SPARSTROW_DEV === "1"
    ? (env.SPARSTROW_UI_URL ?? DEFAULT_DEV_UI_URL)
    : (env.SPARSTROW_CORE_URL ?? DEFAULT_CORE_URL);
}

/**
 * What the window loads: the hosted app when configured, the local UI otherwise.
 *
 * There is deliberately no default production hostname. Nothing is deployed
 * yet, and a default naming a domain nobody has registered would turn "not
 * deployed" into "the desktop app fails with a DNS error for a host that does
 * not exist". Unset is a working product, not a degraded one.
 *
 * Whitespace-only is treated as unset: a `SPARSTROW_APP_URL=` line in an env
 * file is someone clearing the value, not asking to load the empty string.
 */
export function resolveAppUrl(env: UrlEnv): string {
  const configured = env.SPARSTROW_APP_URL?.trim().replace(/\/+$/, "");
  return configured || resolveLocalUiUrl(env);
}

/** True when the window is falling back — used only to make the startup log honest. */
export function isLocalFallback(env: UrlEnv): boolean {
  return resolveAppUrl(env) === resolveLocalUiUrl(env);
}
