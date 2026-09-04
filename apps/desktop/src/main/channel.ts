import fs from "node:fs";
import path from "node:path";

/**
 * The backend this specific packaged build talks to out of the box.
 *
 * Baked into `resourcesPath` at build time (`prepare-resources.mjs`, driven by
 * `SPARSTROW_BUILD_CHANNEL`) — deliberately NOT a machine-wide environment
 * variable. The stable and staging installers now coexist on one machine under
 * separate app IDs (see `package.json`'s per-channel `build` overrides); a
 * shared env var would let installing one silently repoint the other, since
 * both processes would read the same `HKCU\Environment` value. Living inside
 * each install's own `resourcesPath` instead makes that collision impossible —
 * every install carries its own copy.
 *
 * `SPARSTROW_APP_URL` and `SPARSTROW_CLOUD_URL` set explicitly (still the
 * override an operator reaches for per `doc/runbooks/deploy-web-app.md`)
 * always win over this — see `urls.ts` and `packaged-env.ts`.
 */
export interface ChannelConfig {
  channel: "stable" | "dev";
  /** electron-updater's `autoUpdater.channel` — which GitHub Release feed this install checks. */
  updateChannel: string;
  /**
   * ⚠️ **Dead since restructure Phase 3, and kept only so old `channel.json`
   * files still validate.**
   *
   * It used to be the default for `SPARSTROW_APP_URL` — what the window loads.
   * The window now loads the SPA this app ships, and nothing reads this field.
   * Do not wire it back up: a per-install file naming a remote web app is how
   * a desktop build ends up depending on a deployed website again.
   *
   * `cloudUrl` below is still live and still means something different — where
   * this machine's DAEMON reports to.
   */
  appUrl: string;
  /** Default value for `SPARSTROW_CLOUD_URL` — what the local daemon reports to. */
  cloudUrl: string;
  /**
   * The ports this install owns.
   *
   * Optional so a `channel.json` written by an older build still validates and
   * the install keeps working across an update. Absent means "the defaults for
   * this channel" — see `ports.ts`, which holds the table and the reason these
   * are resolved lazily rather than captured at import time.
   *
   * These live here, per install, for exactly the reason the rest of this file
   * does: a machine-wide env var would let installing one channel silently
   * repoint the other, and two apps fighting over one port is the specific
   * failure this field exists to prevent.
   */
  corePort?: number;
  serverPort?: number;
}

/** Absent is fine; present must be a real port number, not a string or 0. */
function isOptionalPort(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 65536);
}

function isChannelConfig(value: unknown): value is ChannelConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.channel === "stable" || v.channel === "dev") &&
    typeof v.updateChannel === "string" &&
    v.updateChannel.length > 0 &&
    typeof v.appUrl === "string" &&
    v.appUrl.length > 0 &&
    typeof v.cloudUrl === "string" &&
    v.cloudUrl.length > 0 &&
    isOptionalPort(v.corePort) &&
    isOptionalPort(v.serverPort)
  );
}

/**
 * Reads the baked channel config from a packaged install's resources dir.
 *
 * Returns `null` when unpackaged (dev has no baked resource and none is
 * expected — `resourcesPath` is `null`), when the file is missing, or when it
 * fails to parse as a well-formed `ChannelConfig`. Every caller treats `null`
 * as "fall back to the pre-channel behavior" rather than throwing — a
 * malformed or absent resource should degrade to today's explicit-env-var-only
 * story, not crash the app.
 */
export function readChannelConfig(resourcesPath: string | null): ChannelConfig | null {
  if (!resourcesPath) return null;
  try {
    const raw = fs.readFileSync(path.join(resourcesPath, "channel.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isChannelConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
