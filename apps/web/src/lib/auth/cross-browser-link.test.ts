import { describe, it, expect } from "vitest";
import {
  crossBrowserOutcome,
  isMissingCodeVerifier,
  isRecoveryNext,
  RECOVERY_DESTINATION,
} from "./cross-browser-link";
import { safeRedirectPath } from "./redirect";

describe("isMissingCodeVerifier", () => {
  it("matches the message Supabase actually returns", () => {
    // Verbatim from the owner's own report -- a confirmation email opened in a
    // different browser than the one that signed up. If this stops matching,
    // that whole flow silently regresses to showing this string to the user.
    expect(
      isMissingCodeVerifier(
        "PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.",
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMissingCodeVerifier("Code Verifier missing")).toBe(true);
  });

  it("does NOT match an expired or already-used link", () => {
    // These need the opposite advice: request a fresh link. Treating them as
    // cross-browser would tell someone to go find the original browser, which
    // will fail there too and for a completely different reason.
    expect(isMissingCodeVerifier("Email link is invalid or has expired")).toBe(false);
    expect(isMissingCodeVerifier("Token has expired or is invalid")).toBe(false);
    expect(isMissingCodeVerifier("")).toBe(false);
  });
});

describe("isRecoveryNext", () => {
  it("recognises the recovery destination this app actually sends", () => {
    expect(isRecoveryNext(RECOVERY_DESTINATION)).toBe(true);
  });

  it("is false for everything else, including nothing at all", () => {
    expect(isRecoveryNext(null)).toBe(false);
    expect(isRecoveryNext("/")).toBe(false);
    expect(isRecoveryNext("/machines")).toBe(false);
  });

  it("must be read BEFORE safeRedirectPath, which destroys the signal", () => {
    // The regression guard for this whole design. safeRedirectPath rewrites
    // every /auth/* path to "/" to close an open redirect, so a recovery flow
    // sanitised first is indistinguishable from an ordinary sign-in -- which
    // is precisely how the reset link ended up landing on the dashboard.
    expect(safeRedirectPath(RECOVERY_DESTINATION)).toBe("/");
    expect(isRecoveryNext(safeRedirectPath(RECOVERY_DESTINATION))).toBe(false);
  });
});

describe("crossBrowserOutcome", () => {
  it("tells a confirmation user their address is confirmed and to sign in", () => {
    // Supabase's /verify endpoint confirms the address BEFORE redirecting with
    // the code, so by this point the account really is ready and only the
    // session is missing. Anything that implies the confirmation failed would
    // be untrue.
    const outcome = crossBrowserOutcome(false);
    expect(outcome.kind).toBe("notice");
    expect(outcome.text).toMatch(/confirmed/i);
    expect(outcome.text).toMatch(/sign in/i);
  });

  it("tells a password-reset user to request a new link instead", () => {
    // There is no session to sign in to on this path, so "sign in below" would
    // be advice that cannot be followed.
    const outcome = crossBrowserOutcome(true);
    expect(outcome.kind).toBe("error");
    expect(outcome.text).toMatch(/request a new link/i);
    expect(outcome.text).not.toMatch(/sign in below/i);
  });
});
