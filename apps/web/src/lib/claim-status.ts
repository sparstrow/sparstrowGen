/**
 * Where the desktop auto-claim reports what happened, so the Machines page can
 * say so.
 *
 * `DesktopAutoClaim` runs app-wide (it must — the computer should connect
 * whatever page you land on) but the only sensible place to REPORT a failure is
 * the page where someone goes looking for their computer. Those are different
 * components with no parent between them worth threading state through, so the
 * outcome goes in a tiny module-scoped store instead.
 *
 * Why this exists at all: the first version swallowed every failure silently.
 * That is right for the happy path — nobody wants a toast for a step they never
 * asked to take — but it meant a computer that could not connect produced no
 * machine, no error, and nothing anywhere to explain the absence. The spec asks
 * for the opposite (US1 scenarios 4 and 5, FR-019): a machine that failed to
 * register says so, and an empty list never stands in for a failure.
 */

export type ClaimStatus =
  | { state: "idle" }
  | { state: "claiming" }
  | { state: "claimed" }
  | { state: "failed"; reason: string };

let current: ClaimStatus = { state: "idle" };
const listeners = new Set<(s: ClaimStatus) => void>();

export function getClaimStatus(): ClaimStatus {
  return current;
}

export function setClaimStatus(next: ClaimStatus): void {
  current = next;
  for (const listener of listeners) listener(next);
}

/** Returns an unsubscribe, shaped for `useSyncExternalStore`. */
export function subscribeClaimStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
