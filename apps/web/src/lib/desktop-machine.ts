/**
 * The desktop shell's machine bridge — US1's half of "connecting takes no
 * steps".
 *
 * Probing for the function rather than for `sparstrowDesktop` means an older
 * shell (one built before this feature) degrades to "not available" instead of
 * throwing. Same posture as `directory-picker.ts`, and for the same reason:
 * the web app is served to both a browser and an Electron window from the same
 * build.
 *
 * Reads `globalThis`, not `window`, so this module is importable under node.
 */

export type ClaimResult =
  | { ok: true; machineId: string; workspaces: number }
  | { ok: false; error: string };

export type CloudStatus = {
  connected: boolean;
  machineId?: string | null;
  workspaces?: number;
  cloudUrl?: string;
  pid?: number;
  uptimeMs?: number;
  /** Present when the shell could not reach core at all. */
  error?: string;
};

export type DaemonPrefs = {
  autoStartOnLaunch: boolean;
  autoStopOnQuit: boolean;
};

export interface DesktopMachineBridge {
  claim(token: string, name?: string): Promise<ClaimResult>;
  status(): Promise<CloudStatus>;
}

export interface DesktopDaemonBridge {
  getPrefs(): Promise<DaemonPrefs>;
  setPrefs(patch: Partial<DaemonPrefs>): Promise<DaemonPrefs>;
}

function daemonBridge(): DesktopDaemonBridge | null {
  const host = globalThis as { sparstrowDesktop?: { daemon?: unknown } };
  const daemon = host.sparstrowDesktop?.daemon as DesktopDaemonBridge | undefined;
  return typeof daemon?.getPrefs === "function" && typeof daemon?.setPrefs === "function"
    ? daemon
    : null;
}

/** True only inside a desktop shell that exposes the lifecycle switches. */
export function desktopDaemonAvailable(): boolean {
  return daemonBridge() !== null;
}

export function desktopGetDaemonPrefs(): Promise<DaemonPrefs | null> {
  const daemon = daemonBridge();
  return daemon ? daemon.getPrefs() : Promise.resolve(null);
}

export function desktopSetDaemonPrefs(
  patch: Partial<DaemonPrefs>,
): Promise<DaemonPrefs | null> {
  const daemon = daemonBridge();
  return daemon ? daemon.setPrefs(patch) : Promise.resolve(null);
}

function bridge(): DesktopMachineBridge | null {
  const host = globalThis as { sparstrowDesktop?: { machine?: unknown } };
  const machine = host.sparstrowDesktop?.machine as DesktopMachineBridge | undefined;
  return typeof machine?.claim === "function" && typeof machine?.status === "function"
    ? machine
    : null;
}

/** True only inside a desktop shell new enough to claim its own computer. */
export function desktopMachineAvailable(): boolean {
  return bridge() !== null;
}

export function desktopCloudStatus(): Promise<CloudStatus> {
  const machine = bridge();
  if (!machine) return Promise.resolve({ connected: false });
  return machine.status();
}

export function desktopClaimMachine(token: string, name?: string): Promise<ClaimResult> {
  const machine = bridge();
  if (!machine) {
    return Promise.resolve({ ok: false, error: "This build has no machine bridge." });
  }
  return machine.claim(token, name);
}
