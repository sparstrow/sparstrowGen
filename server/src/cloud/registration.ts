import os from "node:os";
import { inArray } from "drizzle-orm";
import { DAEMON_SETTABLE_KEYS, type RuntimeIdentity } from "@sparstrow/shared";
import { getDb, isDbOpen } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { claimMachine } from "./claim.js";
import { logger } from "../logger.js";
import { listProviders } from "../providers/index.js";
import { cloudFetch, getRuntimes, isPaired } from "./client.js";

/**
 * M3 — tell the control plane what this machine is and what it can run.
 *
 * Runs on every boot, not only at pairing. Capabilities change: someone
 * installs a CLI, adds an API key, upgrades core. A register-once model means
 * the cloud's picture is accurate exactly once and drifts from then on — and
 * M4 dispatches on that picture.
 */

/** The core version reported to the cloud. Matches server/package.json. */
export const CORE_VERSION = "0.1.0";

/**
 * Wall-clock ceiling for the whole capability probe.
 *
 * Each provider's own healthCheck already carries a timeout (15s for the CLI
 * `--version` calls, 3s for Ollama's fetch), but those are the provider's
 * promise to itself, not a guarantee. `execFile`'s timeout cannot always kill a
 * child blocked in uninterruptible I/O — a configured binary path pointing at a
 * disconnected network drive is the realistic case — and boot must not wait on
 * it. Whatever has not answered by now is reported as unavailable.
 */
const PROBE_BUDGET_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    // `unref` so a probe still in flight cannot hold the process open at exit.
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/**
 * What this machine can ACTUALLY run.
 *
 * Deliberately not `listProviders().map(p => p.id)`. That returns the static
 * registry — every provider the build knows about, installed or not — so it
 * claims Claude Code on a host with no `claude` binary and Antigravity on one
 * that has never seen `agy`. M4 routes dispatch on `runtimes.capabilities`, so
 * a false claim there becomes a run that dies at spawn, and the failure
 * surfaces one layer away from its cause.
 *
 * Every provider already implements `healthCheck()`, and `ok` means the right
 * thing for each kind: the CLI providers shell out to `--version`,
 * `anthropic-api` checks for a stored key, `ollama` pings its server. Reuse
 * that rather than writing a second, subtly different notion of "available".
 *
 * Never throws. A probe that fails is a capability this machine does not have,
 * which is information, not an error.
 */
export async function probeCapabilities(): Promise<string[]> {
  const providers = listProviders();

  const results = await Promise.all(
    providers.map((provider) =>
      withTimeout(
        provider.healthCheck().catch(() => null),
        PROBE_BUDGET_MS,
        null,
      ).then((health) => ({ id: provider.id, ok: health?.ok === true })),
    ),
  );

  return results.filter((r) => r.ok).map((r) => r.id);
}

/** Everything this machine reports about itself. Shared by pairing and register. */
export async function describeMachine(name?: string | null): Promise<RuntimeIdentity> {
  return {
    name: name?.trim() || null,
    hostname: os.hostname(),
    os: process.platform,
    // The only signal available: the desktop shell sets SPARSTROW_PACKAGED in
    // packaged-env.ts. A dev-mode Electron run therefore reports false, which
    // is a known limitation rather than a bug — nothing in M3 or M4 branches on
    // this field, it is displayed so a person can tell their machines apart.
    isElectron: process.env.SPARSTROW_PACKAGED === "1",
    capabilities: await probeCapabilities(),
    coreVersion: CORE_VERSION,
    settings: readReportableSettings(),
  };
}

/**
 * This machine's current values for the remotely-settable keys.
 *
 * Only the allowlisted keys, and deliberately so: the settings table holds
 * machine-local configuration that is nobody else's business, and a report
 * that shipped all of it would be a slow leak of exactly the kind of detail
 * the secret store exists to keep off the wire.
 *
 * Absent keys are omitted rather than defaulted here — `isWipSnapshotEnabled`
 * owns what an unset value means, and duplicating that default would give the
 * browser a second opinion about it.
 */
export function readReportableSettings(): Record<string, string> {
  // Registration can run before the database is open, and during shutdown
  // after it has closed. Neither is a reason to fail a report.
  if (!isDbOpen()) return {};
  try {
    const rows = getDb()
      .select()
      .from(settings)
      .where(inArray(settings.key, [...DAEMON_SETTABLE_KEYS]))
      .all();
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } catch (err) {
    logger.debug({ err }, "could not read reportable settings");
    return {};
  }
}

/**
 * Push just the settings, without re-registering.
 *
 * Deliberately not `register()`. That runs the capability probe — up to
 * `PROBE_BUDGET_MS` of spawning provider binaries — which is absurd for
 * confirming a boolean, and sending an identity with an unprobed
 * `capabilities: []` would wipe the field the cloud dispatches on. A separate
 * one-column route is cheaper and cannot cause that.
 *
 * Never throws. A failed report self-corrects at the next boot.
 */
export async function reportSettings(): Promise<void> {
  if (!isPaired()) return;
  try {
    await cloudFetch("/settings", { body: { settings: readReportableSettings() }, retries: 1 });
  } catch (err) {
    logger.debug({ err }, "could not report settings to the control plane");
  }
}

/**
 * Register this machine with the control plane.
 *
 * Returns true when the cloud was updated. Never throws: an unpaired machine
 * has nothing to register, and a registration that fails must not take core's
 * startup with it. M3 adds a capability, it does not add a dependency.
 *
 * `name` is deliberately not sent. It defaults to the hostname at pairing and
 * is editable in the UI; re-registering on every boot must not stomp a name
 * the owner chose. Renaming is the browser's job.
 */
export async function register(): Promise<boolean> {
  if (!isPaired()) return false;

  // Claim first, always. It is what tells this machine which runtime
  // represents it in which workspace, and every call below needs that map to
  // address anything at all. On a first boot after connecting there is no map
  // yet; on every later boot the owner may have created or left a workspace
  // while this machine was off.
  try {
    await claimMachine();
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "could not claim this computer — continuing locally",
    );
    return false;
  }

  const runtimes = getRuntimes();
  if (runtimes.length === 0) {
    logger.info("connected, but this account has no workspace yet — nothing to register into");
    return false;
  }

  // One registration per workspace. `capabilities` is the same everywhere —
  // it describes the hardware, not the workspace — but each workspace's
  // runtime row is a separate record and each has to be told.
  //
  // Settled rather than sequential-with-throw: one workspace failing must not
  // stop the others being registered, or a single bad row would make the whole
  // machine look offline everywhere.
  const results = await Promise.allSettled(
    runtimes.map(async (binding) => {
      const identity = await describeMachine();
      await cloudFetch("/register", { body: identity, runtimeId: binding.runtimeId });
    }),
  );

  const registered = results.filter((r) => r.status === "fulfilled").length;
  if (registered === 0) {
    logger.warn(
      "could not register with the cloud control plane in any workspace — continuing locally",
    );
    return false;
  }

  logger.info(
    { workspaces: registered, of: runtimes.length },
    "registered this computer with the cloud control plane",
  );
  return true;
}
