import fs from "node:fs";
import path from "node:path";

/**
 * US2 — "when the laptop is on, the machine should always be reachable."
 *
 * Two switches, and the second one is the whole point. Until this existed,
 * closing the window minimised to the tray and core kept running, but choosing
 * Quit stopped it outright — with nothing on screen saying the two were
 * different. A machine that had been online all week went silently unreachable
 * because someone tidied their taskbar.
 *
 * `autoStopOnQuit` therefore defaults to FALSE: quitting the app leaves the
 * runtime running. That is the behaviour the owner asked for, and it is also
 * the surprising one, which is why the Settings card that renders these says
 * plainly what each does rather than showing two bare toggles.
 *
 * Stored as JSON in the app's userData dir, deliberately outside the repo and
 * outside core's own data dir: these are preferences about the SHELL's
 * behaviour, not the daemon's, and a `--force-reinstall` of core should not
 * reset them.
 */

export interface DaemonPrefs {
  /** Start the runtime when the app launches. */
  autoStartOnLaunch: boolean;
  /** Stop the runtime when the app quits. Off by default — see above. */
  autoStopOnQuit: boolean;
}

export const DEFAULT_PREFS: DaemonPrefs = {
  autoStartOnLaunch: true,
  autoStopOnQuit: false,
};

const FILE_NAME = "daemon-prefs.json";

function prefsPath(userDataDir: string): string {
  return path.join(userDataDir, FILE_NAME);
}

/**
 * Read preferences, falling back to defaults for anything missing or corrupt.
 *
 * Never throws. A machine that will not start its runtime because a settings
 * file has a stray comma in it is a worse failure than one that quietly uses
 * the defaults — and the defaults are the behaviour almost everyone wants.
 */
export function readDaemonPrefs(userDataDir: string): DaemonPrefs {
  try {
    const raw = fs.readFileSync(prefsPath(userDataDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<DaemonPrefs>;
    return {
      autoStartOnLaunch:
        typeof parsed.autoStartOnLaunch === "boolean"
          ? parsed.autoStartOnLaunch
          : DEFAULT_PREFS.autoStartOnLaunch,
      autoStopOnQuit:
        typeof parsed.autoStopOnQuit === "boolean"
          ? parsed.autoStopOnQuit
          : DEFAULT_PREFS.autoStopOnQuit,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Merge a partial update over what is stored, and return the result. */
export function writeDaemonPrefs(
  userDataDir: string,
  patch: Partial<DaemonPrefs>,
): DaemonPrefs {
  const next: DaemonPrefs = { ...readDaemonPrefs(userDataDir), ...patch };
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(prefsPath(userDataDir), JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    // Reported, not thrown: the in-memory value is still correct for this
    // session, so the switch the person just flipped does what they expect
    // even though it will not survive a restart. Silently succeeding would be
    // worse; refusing the switch outright would be worse still.
    console.error("[daemon-prefs] could not persist preferences:", err);
  }
  return next;
}
