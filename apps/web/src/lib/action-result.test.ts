import { describe, expect, it } from "vitest";
import { actionErrorFrom } from "./action-result";

/**
 * `actionErrorFrom` exists to match `apps/web/src/lib/api/router.ts#handleError`'s
 * status-to-message mapping exactly (its own doc comment says so). This test
 * exists because it didn't, for three of five codes — see
 * `doc/bug/BUG-2026-08-26-action-error-mapping-missing-three-codes.md`.
 */
describe("actionErrorFrom", () => {
  it("maps PGRST116 (no row matched) to Not Found", () => {
    const r = actionErrorFrom({ code: "PGRST116", message: "no rows" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Not Found");
  });

  it("maps PGRST204/42703 (unknown column) to the raw message", () => {
    const r = actionErrorFrom({ code: "42703", message: "column \"bogus\" does not exist" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('column "bogus" does not exist');
  });

  it("maps 42501 (RLS denial) to the same message handleError uses", () => {
    const r = actionErrorFrom({ code: "42501", message: "permission denied" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Forbidden by Row Level Security");
  });

  it("maps 23505 (unique violation) to the same message handleError uses", () => {
    const r = actionErrorFrom({ code: "23505", message: "duplicate key value" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Resource already exists (unique violation)");
  });

  it("maps 23503 (foreign key violation) to the same message handleError uses", () => {
    const r = actionErrorFrom({ code: "23503", message: "violates foreign key constraint" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Invalid reference (foreign key violation)");
  });

  it("falls back to the raw message for an unrecognized code", () => {
    const r = actionErrorFrom({ code: "99999", message: "something else" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("something else");
  });
});
