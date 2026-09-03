import { coreFetch } from "./core-client";
import { probeHealth } from "./service-manager";
import { readToken } from "./session";

/**
 * Put this computer into the workspaces its credential can see.
 *
 * ## Why this exists as an automatic step
 *
 * It did not, and that was the bug. `sparstrow:claim-machine` has been a
 * complete, working IPC handler for as long as the desktop app has had one —
 * and **nothing has ever called it.** The old web UI had a button; the SPA that
 * replaced it in restructure Phase 3 did not bring one across. So a person could
 * install the app, sign in successfully, and land on "No machines yet" forever,
 * with every individual piece working.
 *
 * It survived Phase 4's verification because the verification called the handler
 * over CDP and then recorded "my machine is there" — which was true of the
 * bridge and false of the application. A capability reachable only by someone
 * holding a debugger is not a feature.
 *
 * ## Why it is automatic rather than a button
 *
 * #213 — "computers that are just there". A person-scoped token already proves
 * who this is; asking them to then press Connect is asking them to confirm
 * something the app already knows. There is no pairing step by design, so there
 * is no button by design either.
 *
 * ## Why it lives in the main process
 *
 * The renderer would have to orchestrate three things it should not know about:
 * when the local runtime became healthy, where the credential is, and how to
 * retry. Main knows all three, and doing it here means the session token never
 * crosses the bridge for this path at all.
 */

/** How long to keep waiting for the local runtime before giving up on a claim. */
const CLAIM_WINDOW_MS = 60_000;
const CLAIM_POLL_MS = 2_000;

export type ClaimOutcome =
  | { ok: true; machineId: string; workspaces: number }
  | { ok: false; error: string };

/**
 * Told about a successful claim, so the window can refetch.
 *
 * At launch the window renders before the claim finishes — the runtime has to
 * come up first — so without this the machine list would render "No machines
 * yet" and then keep saying it, correctly, against data fetched a moment too
 * early. Set by `main.ts`, which owns the window.
 */
let onClaimed: (() => void) | null = null;
export function setClaimListener(fn: () => void): void {
  onClaimed = fn;
}

/**
 * Claim, once the runtime is up.
 *
 * Deliberately **idempotent and safe to call on every launch**: the daemon's
 * `/system/cloud-token` saves the connection and re-registers, keyed on a
 * machine id that is generated once and persisted (`getOrCreateMachineId`), so
 * a repeat claim refreshes this computer's registration rather than creating a
 * second machine. That is what makes "claim at every start" the right shape —
 * it also repairs a machine whose registration went stale while the app was
 * closed.
 *
 * Waits rather than failing fast because the runtime and the window start
 * together now (see `main.ts`), so at launch this races a service that is
 * usually seconds away from healthy. A claim that gave up immediately would
 * fail on almost every cold start.
 */
export async function claimThisComputer(
  reason: string,
  name?: string,
): Promise<ClaimOutcome> {
  const token = readToken();
  if (!token) {
    // Not an error. Signed out is a normal state, and the sign-in flow calls
    // this again the moment it stops being true.
    return { ok: false, error: "not signed in" };
  }

  const deadline = Date.now() + CLAIM_WINDOW_MS;
  let lastError = "the local runtime never became reachable";
  while (Date.now() < deadline) {
    if (await probeHealth(1500, null)) {
      try {
        const res = await coreFetch("/system/cloud-token", {
          method: "POST",
          body: name ? { token, name } : { token },
          // Reaches the control plane and back, unlike coreFetch's local pings.
          timeoutMs: 30_000,
        });
        if (res.ok) {
          const claimed = (await res.json()) as { machineId: string; workspaces: number };
          console.log(
            `[claim] ${reason}: this computer is in ${claimed.workspaces} workspace(s) (${claimed.machineId})`,
          );
          onClaimed?.();
          return { ok: true, ...claimed };
        }
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        lastError = detail?.error ?? `the runtime returned ${res.status}`;
        // A refusal is an answer, not a timeout. Retrying a 400 for a minute
        // would turn one clear failure into sixty identical log lines.
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, CLAIM_POLL_MS));
  }

  console.error(`[claim] ${reason}: could not claim this computer — ${lastError}`);
  return { ok: false, error: lastError };
}
