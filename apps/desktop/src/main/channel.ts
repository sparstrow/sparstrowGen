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
  channel: "stable" | "staging";
  /** electron-updater's `autoUpdater.channel` — which GitHub Release feed this install checks. */
  updateChannel: string;
  /** Default value for `SPARSTROW_APP_URL` — what the window loads. */
  appUrl: string;
  /** Default value for `SPARSTROW_CLOUD_URL` — what the local daemon reports to. */
  cloudUrl: string;
}

function isChannelConfig(value: unknown): value is ChannelConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.channel === "stable" || v.channel === "staging") &&
    typeof v.updateChannel === "string" &&
    v.updateChannel.length > 0 &&
    typeof v.appUrl === "string" &&
    v.appUrl.length > 0 &&
    typeof v.cloudUrl === "string" &&
    v.cloudUrl.length > 0
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
