import os from "node:os";
import type { RuntimeIdentity } from "@sparstrow/shared";
import { logger } from "../logger.js";
import { listProviders } from "../providers/index.js";
import { cloudFetch, isPaired } from "./client.js";

/**
 * M3 — tell the control plane what this machine is and what it can run.
 *
 * Runs on every boot, not only at pairing. Capabilities change: someone
 * installs a CLI, adds an API key, upgrades core. A register-once model means
 * the cloud's picture is accurate exactly once and drifts from then on — and
 * M4 dispatches on that picture.
 */

/** The core version reported to the cloud. Matches packages/core/package.json. */
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
  };
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

  try {
    const identity = await describeMachine();
    await cloudFetch("/register", { body: identity });
    logger.info(
      { capabilities: identity.capabilities, hostname: identity.hostname },
      "registered this machine with the cloud control plane",
    );
    return true;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "could not register with the cloud control plane — continuing locally",
    );
    return false;
  }
}
