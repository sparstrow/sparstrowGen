import type { Storage } from "@sparstrow/core";

/**
 * `@sparstrow/core`'s `Storage`, backed by the renderer's `localStorage`.
 *
 * Per-app and per-install, which is what a remembered workspace or a collapsed
 * pane wants. It is **not** where a credential goes — a token belongs in the OS
 * keychain, reached through the main process, and nothing here should ever be
 * handed one.
 *
 * Guarded like the web app's version: `localStorage` throws rather than
 * returning null when site data is blocked, and losing a preference must never
 * be the reason the app fails to start.
 */
export function desktopStorage(): Storage {
  return {
    async get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Quota or blocked storage. Not worth failing the action that wrote it.
      }
    },
    async remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // As above.
      }
    },
  };
}
