/**
 * What `preload/index.ts` puts on `window`.
 *
 * Declared here rather than imported from the preload module on purpose: the
 * renderer and the preload script run in different contexts and must not share
 * a module graph. This is a description of the bridge, not a link to it.
 *
 * The update surface was `Promise<unknown>` until the Settings screen was
 * built, which is a large part of why it never was: nothing could be rendered
 * from a value with no shape. `DesktopUpdateStatus` below mirrors
 * `main/updater.ts`'s `UpdateStatus` by hand — the same deliberate duplication,
 * for the same reason. If you add a state there, add it here.
 */

declare global {
  /** A run that must finish before an update may install. */
  interface DesktopBlockingRun {
    id: string;
    agentId: string;
    agentName: string | null;
    startedAt: string | null;
  }

  type DesktopUpdateStatus =
    | { state: "idle" }
    | { state: "checking" }
    | { state: "available"; version: string }
    | { state: "downloading"; version: string; percent: number }
    | { state: "downloaded"; version: string }
    | { state: "waiting"; version: string; busy: number; runs: DesktopBlockingRun[] }
    | { state: "installing"; version: string }
    | { state: "error"; message: string };

  interface Window {
    sparstrowDesktop?: {
      version: string;
      onNavigate(cb: (screen: string) => void): () => void;
      updates: {
        getStatus(): Promise<DesktopUpdateStatus>;
        check(): Promise<void>;
        download(): Promise<void>;
        install(opts?: { force?: boolean }): Promise<void>;
        cancel(): Promise<void>;
        onStatus(cb: (status: DesktopUpdateStatus) => void): () => void;
      };
      dialogs: { pickDirectory(defaultPath?: string): Promise<string | null> };
      session: {
        signIn(): Promise<{ ok: true } | { ok: false; error: string }>;
        signOut(): Promise<{ ok: true }>;
        token(): Promise<string | null>;
      };
      machine: {
        claim(token: string, name?: string): Promise<unknown>;
        status(): Promise<unknown>;
      };
      daemon: {
        getPrefs(): Promise<{ autoStartOnLaunch: boolean; autoStopOnQuit: boolean }>;
        setPrefs(patch: Partial<{ autoStartOnLaunch: boolean; autoStopOnQuit: boolean }>): Promise<unknown>;
      };
    };
  }
}

export {};
