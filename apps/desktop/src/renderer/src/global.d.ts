/**
 * What `preload/index.ts` puts on `window`.
 *
 * Declared here rather than imported from the preload module on purpose: the
 * renderer and the preload script run in different contexts and must not share
 * a module graph. This is a description of the bridge, not a link to it.
 */
declare global {
  interface Window {
    sparstrowDesktop?: {
      version: string;
      updates: {
        getStatus(): Promise<unknown>;
        download(): Promise<unknown>;
        install(opts?: { force?: boolean }): Promise<unknown>;
        cancel(): Promise<unknown>;
        onStatus(cb: (status: unknown) => void): () => void;
      };
      dialogs: { pickDirectory(defaultPath?: string): Promise<string | null> };
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
