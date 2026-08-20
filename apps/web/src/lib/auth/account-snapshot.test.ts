import { describe, expect, it } from "vitest";
import { toSnapshot } from "./account-snapshot";

/**
 * Closes BUG-2026-08-18-shell-invents-name-from-email, owned by T-M10-04.
 * The shell must never derive a name from the email address — same rule
 * T-M9-01 already enforces on `bootstrap_workspace`, in the second store.
 */
describe("toSnapshot", () => {
  it("prefers full_name, then name, from metadata", () => {
    expect(toSnapshot({ id: "u1", email: "a@x.com", user_metadata: { full_name: "Sri Hari" } }).name).toBe(
      "Sri Hari",
    );
    expect(toSnapshot({ id: "u1", email: "a@x.com", user_metadata: { name: "Sri" } }).name).toBe(
      "Sri",
    );
  });

  it("is '' when no name is present — never the email local part", () => {
    expect(toSnapshot({ id: "u1", email: "sriharicoder@example.com" }).name).toBe("");
    expect(toSnapshot({ id: "u1", email: "sriharicoder@example.com", user_metadata: {} }).name).toBe(
      "",
    );
  });

  it("is '' when the metadata explicitly holds an empty string — clearing a name stays cleared", () => {
    // This was the second defect: a truthiness chain treated "" the same as
    // absent and fell through to inventing one from the email.
    expect(
      toSnapshot({
        id: "u1",
        email: "sriharicoder@example.com",
        user_metadata: { full_name: "", name: "" },
      }).name,
    ).toBe("");
  });

  it("email and avatar are read straight through, with no invention", () => {
    const snap = toSnapshot({ id: "u1", email: "a@x.com", user_metadata: {} });
    expect(snap.email).toBe("a@x.com");
    expect(snap.avatarUrl).toBeNull();
  });

  it("provider falls back to 'email' when app_metadata carries none", () => {
    expect(toSnapshot({ id: "u1", email: "a@x.com" }).provider).toBe("email");
    expect(
      toSnapshot({ id: "u1", email: "a@x.com", app_metadata: { provider: "github" } }).provider,
    ).toBe("github");
  });
});
