import { describe, expect, it } from "vitest";
import { errorMessageFrom } from "./claude-code.js";

/**
 * Found in M4 verification, against a machine whose Claude OAuth token had
 * expired: the run failed and its `error` column read **"success"**.
 *
 * The cause is that `subtype` describes the shape of the final turn, not the
 * outcome. The CLI sets `is_error: true` with `subtype: "success"` when the
 * turn completed normally but its content is an error — and the real message
 * was sitting in `result` the whole time.
 */
describe("errorMessageFrom", () => {
  it("prefers the CLI's own message over the turn subtype", () => {
    expect(
      errorMessageFrom({
        is_error: true,
        subtype: "success",
        result: 'Failed to authenticate. API Error: 401 {"type":"error"}',
      }),
    ).toMatch(/Failed to authenticate/);
  });

  it("never reports 'success' as the reason a run failed", () => {
    // The exact regression. "success" in an error column sends the reader
    // looking for a run that worked.
    expect(errorMessageFrom({ is_error: true, subtype: "success" })).not.toBe("success");
  });

  it("falls back to a subtype that actually says something", () => {
    expect(errorMessageFrom({ is_error: true, subtype: "error_max_turns" })).toBe(
      "error_max_turns",
    );
  });

  it("ignores an empty or whitespace-only result", () => {
    expect(errorMessageFrom({ is_error: true, subtype: "error_during_execution", result: "   " })).toBe(
      "error_during_execution",
    );
  });

  it("says something rather than nothing when the CLI offers neither", () => {
    expect(errorMessageFrom({ is_error: true })).toBe("unknown error");
  });
});
