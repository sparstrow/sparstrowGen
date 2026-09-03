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

  /** What Settings may know about the local server. Never a secret's value. */
  interface DesktopServerConfig {
    configured: boolean;
    supabaseUrl: string | null;
    hasServiceRoleKey: boolean;
    hasJwtSecret: boolean;
    encryptionAvailable: boolean;
  }

  type DesktopServerState =
    | { state: "stopped" }
    | { state: "external" }
    | { state: "starting" }
    | { state: "running" }
    | { state: "unconfigured" }
    | { state: "failed"; message: string };

  type DesktopServerFields = Partial<
    Record<"supabaseUrl" | "supabaseAnonKey" | "supabaseServiceRoleKey" | "supabaseJwtSecret", string>
  >;

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
      onMachinesChanged(cb: () => void): () => void;
      updates: {
        getStatus(): Promise<DesktopUpdateStatus>;
        check(): Promise<void>;
        download(): Promise<void>;
        install(opts?: { force?: boolean }): Promise<void>;
        cancel(): Promise<void>;
        onStatus(cb: (status: DesktopUpdateStatus) => void): () => void;
      };
      server: {
        getConfig(): Promise<DesktopServerConfig>;
        setConfig(
          patch: DesktopServerFields,
        ): Promise<{ ok: true; status: DesktopServerConfig } | { ok: false; error: string }>;
        clearConfig(): Promise<DesktopServerConfig>;
        getState(): Promise<DesktopServerState>;
        onState(cb: (state: DesktopServerState) => void): () => void;
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
