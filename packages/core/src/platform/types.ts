/**
 * What each app has to supply, and nothing more.
 *
 * This is the seam that lets one data layer serve a browser, an Electron
 * renderer and (later) React Native. Everything platform-specific is here as an
 * interface; everything else in `@sparstrow/core` is written against these
 * types and therefore runs anywhere.
 *
 * Keep it small. Every field added here is a thing three apps must each answer,
 * and the temptation is always to add one rather than to find the portable
 * shape.
 */

/**
 * Key/value persistence that survives a restart.
 *
 * Async because the honest implementations are: React Native's AsyncStorage,
 * and Electron's IPC to the main process. `localStorage` is the odd one out in
 * being synchronous, and modelling on it would have made the other two lie.
 *
 * NOT for secrets. A token belongs in the OS keychain, which the desktop app
 * reaches through its own main process, not through this.
 */
export interface Storage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Which client this is. Sent to `server/` so it can tell them apart. */
export type ClientIdentity = {
  platform: "web" | "desktop" | "mobile";
  /** The app's own version, e.g. `0.1.0`. */
  version: string;
  /** Best-effort OS description. `null` where the platform will not say. */
  os: string | null;
};

/**
 * An in-memory `Storage`, for tests and for a host that has none yet.
 *
 * Exported rather than kept private because "the app forgot my last workspace
 * after a restart" is a much better failure than "the app would not start" —
 * a host wiring itself up can pass this and come back to persistence later.
 */
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}
