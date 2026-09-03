import { describe, expect, it } from "vitest";
import { isUnconfigured, resolveAppUrl } from "./urls";

/**
 * Which URL the desktop window loads.
 *
 * M7's version of this file tested the claim that mattered then: a build with
 * no new environment variable must behave EXACTLY as it did before that phase.
 * That claim is retired, deliberately. T-VR-01 deleted the local UI it fell
 * back to — core serves an API now — so "unset" can no longer mean "load the
 * local UI", and the tests asserting `resolveLocalUiUrl`, `SPARSTROW_DEV` and
 * `SPARSTROW_UI_URL` went with the code they described rather than being
 * loosened until they passed.
 *
 * What replaces it is the claim that matters now: unset is `null`, and the
 * caller is expected to say so rather than load something.
 */

describe("resolveAppUrl", () => {
  it("uses the hosted app when configured", () => {
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://app.example.com" })).toBe(
      "https://app.example.com",
    );
  });

  it("is null when unset — there is no default hostname to invent", () => {
    // A default naming a domain nobody registered would turn "not configured"
    // into a DNS error for a host the user never chose. Unchanged from M7; only
    // the other branch moved.
    expect(resolveAppUrl({})).toBeNull();
  });

  it("is null when set to whitespace — clearing a value is not a value", () => {
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "" })).toBeNull();
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "   " })).toBeNull();
  });

  it("strips trailing slashes so the URL is one value, not two", () => {
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://app.example.com/" })).toBe(
      "https://app.example.com",
    );
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://app.example.com///" })).toBe(
      "https://app.example.com",
    );
  });

  it("does not read SPARSTROW_CLOUD_URL — the daemon's target is not the window's", () => {
    // Kept from M7 verbatim in intent: the two variables name the same host once
    // deployed and mean different things, and collapsing them would make
    // pointing a window at staging a code change.
    const env = { SPARSTROW_CLOUD_URL: "https://cloud.example.com" } as Record<string, string>;
    expect(resolveAppUrl(env)).toBeNull();
  });

  it("no longer falls back to the local core, which serves no UI", () => {
    // The regression this guards: restoring a fallback here would load core's
    // API root and render a bare 404 in the desktop window.
    const env = { SPARSTROW_CORE_URL: "http://127.0.0.1:48750" } as Record<string, string>;
    expect(resolveAppUrl(env)).toBeNull();
  });
});

describe("isUnconfigured", () => {
  it("is true when unset, so the caller can show a screen that says so", () => {
    expect(isUnconfigured({})).toBe(true);
  });

  it("is false when a hosted app is configured", () => {
    expect(isUnconfigured({ SPARSTROW_APP_URL: "https://app.example.com" })).toBe(false);
  });
});

describe("resolveAppUrl after the bundled server was removed", () => {
  it("no longer takes a local port at all", () => {
    // Restructure Phase 3 deleted `spawnWeb()`. There is no bundled Next.js
    // server, so there is no port to fall back to and the second parameter is
    // gone. The window falls back to the SPA it ships, which `main.ts` decides
    // -- not this function.
    expect(resolveAppUrl({})).toBeNull();
  });

  it("is purely an override now, and an override still wins", () => {
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://staging.sparstrow.com" })).toBe(
      "https://staging.sparstrow.com",
    );
  });

  it("isUnconfigured means 'no override', not 'nowhere to go'", () => {
    expect(isUnconfigured({})).toBe(true);
    expect(isUnconfigured({ SPARSTROW_APP_URL: "https://app.example.com" })).toBe(false);
  });
});
