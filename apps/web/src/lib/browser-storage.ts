import type { Storage } from "@sparstrow/core";

/**
 * `@sparstrow/core`'s `Storage`, backed by `localStorage`.
 *
 * The interface is async because the honest implementations are — React
 * Native's AsyncStorage and Electron's IPC to the main process. `localStorage`
 * is the odd one out in being synchronous, so this adapter is the thin place
 * where that difference is absorbed rather than leaked into the data layer.
 *
 * Every access is guarded. `localStorage` throws, not returns null, in Safari's
 * private mode and wherever a user has blocked site data — and a data layer
 * that cannot start because a preference could not be read is a worse outcome
 * than one that forgets which workspace you were in.
 */
export function browserStorage(): Storage {
  return {
    async get(key) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        // Quota exceeded, or storage blocked. Losing a remembered preference
        // is not worth failing the action that triggered the write.
      }
    },
    async remove(key) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // As above.
      }
    },
  };
}
