import type { ClaimMachineResponse } from "@sparstrow/shared";
import { logger } from "../logger.js";
import { cloudFetch, getOrCreateMachineId, getRuntimes, isPaired, saveRuntimes } from "./client.js";
import { describeMachine } from "./registration.js";

/**
 * "This computer is mine, and here is what it can do."
 *
 * Called on every boot and after every credential change, never once at setup.
 * That is the whole point of it: workspace membership changes without this
 * machine being involved — the owner creates a personal workspace from their
 * phone, or leaves one — and a claim-once model means this machine's runtime
 * map is accurate exactly once and silently wrong from then on. A boot is also
 * a reconciliation.
 *
 * The map it returns is what every later request depends on: `cloudFetch`
 * sends a runtime id in `X-Sparstrow-Runtime`, and the control plane derives
 * the workspace from it. A machine with a stale map addresses runtimes that no
 * longer exist and gets `unknown_runtime` back — which is precisely the signal
 * to come back here rather than to conclude it has been revoked.
 */
export async function claimMachine(name?: string): Promise<ClaimMachineResponse | null> {
  if (!isPaired()) return null;

  const identity = await describeMachine(name);
  const machineId = getOrCreateMachineId();

  // `runtimeId: null` — this request is about the MACHINE, not about any one
  // workspace, and on a first claim there is no runtime to name yet.
  const response = await cloudFetch<ClaimMachineResponse>("/claim", {
    body: { machineId, ...identity },
    runtimeId: null,
    retries: 1,
  });

  // Only overwrite the map when the response actually carried one. A 200 with
  // an unexpected shape used to be read as "you have no runtimes", which wiped
  // a working map and stopped the machine beating until the next boot — a
  // server hiccup turning into an offline machine. An empty ARRAY still wipes,
  // deliberately: that is the real answer when someone has left every
  // workspace.
  if (!Array.isArray(response?.runtimes)) {
    logger.warn("claim returned no runtime list — keeping the previous one");
    return response ?? null;
  }

  const runtimes = response.runtimes;
  const before = getRuntimes();
  saveRuntimes(runtimes);

  // Logged only when it actually changes. A machine that boots daily for a
  // year should not produce 365 identical lines saying it still serves the
  // same one workspace — but the day it gains or loses one is the day someone
  // reads this log to find out why work stopped arriving.
  if (before.length !== runtimes.length) {
    logger.info(
      { workspaces: runtimes.length, was: before.length },
      "this computer's workspaces changed",
    );
  } else if (before.length === 0) {
    logger.info(
      "connected, but this account has no workspace yet — will pick one up on the next claim",
    );
  }

  return response;
}

/**
 * Re-claim after the control plane rejected a runtime this machine thought it
 * had.
 *
 * Separated from `claimMachine` only so callers read as what they mean at the
 * call site. The distinction matters when reading a log: a claim at boot is
 * routine, and a claim triggered by a rejected runtime means something changed
 * underneath this machine while it was running.
 */
export async function reclaimAfterUnknownRuntime(): Promise<void> {
  logger.info("a runtime this computer was using is gone — re-claiming to refresh its workspaces");
  try {
    await claimMachine();
  } catch (err) {
    // Best effort. The caller is already in a failure path, and the next boot
    // or heartbeat tries again; turning a refresh failure into a thrown error
    // here would replace a recoverable state with a crash.
    logger.warn({ err }, "could not re-claim after an unknown runtime");
  }
}
