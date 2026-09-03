/**
 * What a failed API call looks like to every client.
 *
 * Moved here from `apps/web/src/lib/api-client.ts` so desktop and mobile get
 * the same failure vocabulary rather than each inventing one.
 */
export class ApiError extends Error {
  readonly status: number;

  /**
   * Stable machine-readable failure token from the response body, when the
   * server sent one (`no_runtime_available`, `project_not_available`,
   * `server_unreachable`, …).
   *
   * The UI switches on this; the `message` is prose for a person. The
   * distinction is load-bearing: "no machine is online" and "this machine
   * doesn't have that project" lead to completely different offers on screen,
   * and matching on message text breaks the first time someone improves the
   * wording. `server/`'s `fail()` is the other half of this contract.
   */
  readonly reason: string | null;

  constructor(status: number, message: string, reason: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.reason = reason;
  }

  /** The session is gone or was never there. Every client signs in again. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /**
   * `server/` could not be reached at all — a different thing from any status
   * it might return, and the only failure a client can sometimes fix itself
   * (start the server, or point at a different one).
   */
  get isUnreachable(): boolean {
    return this.status === 0 || this.reason === "server_unreachable";
  }
}
