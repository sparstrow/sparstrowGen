import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps ordinary in-app destinations", () => {
    expect(safeRedirectPath("/runs")).toBe("/runs");
    expect(safeRedirectPath("/runs/abc-123")).toBe("/runs/abc-123");
    expect(safeRedirectPath("/tasks?status=open")).toBe("/tasks?status=open");
  });

  it("falls back to the dashboard when there is nothing to honour", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  it("refuses absolute URLs to other origins", () => {
    expect(safeRedirectPath("https://evil.example/harvest")).toBe("/");
    expect(safeRedirectPath("http://evil.example")).toBe("/");
    // A scheme does not have to be http to be dangerous.
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe("/");
  });

  it("refuses protocol-relative URLs", () => {
    // The case a naive startsWith("/") check waves straight through: browsers
    // treat these as absolute, so this is a genuine off-site redirect.
    expect(safeRedirectPath("//evil.example/harvest")).toBe("/");
    expect(safeRedirectPath("/\\evil.example/harvest")).toBe("/");
  });

  it("refuses to bounce back into the auth flow", () => {
    // Landing on /login while signed in just gets redirected again, and the
    // /auth/* entries are route handlers rather than pages.
    expect(safeRedirectPath("/login")).toBe("/");
    expect(safeRedirectPath("/auth/callback")).toBe("/");
    expect(safeRedirectPath("/auth/sign-out")).toBe("/");
  });
});
