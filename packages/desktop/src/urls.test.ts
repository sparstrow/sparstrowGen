import { describe, expect, it } from "vitest";
import {
  DEFAULT_CORE_URL,
  DEFAULT_DEV_UI_URL,
  isLocalFallback,
  resolveAppUrl,
  resolveLocalUiUrl,
} from "./urls";

/**
 * M7 — which URL the desktop window loads.
 *
 * The claim under test is the one that would be most embarrassing to get wrong:
 * a build with no new environment variable must behave EXACTLY as it did before
 * this phase existed. Everything else here is in service of that.
 */

describe("resolveLocalUiUrl", () => {
  it("is the packaged core by default", () => {
    expect(resolveLocalUiUrl({})).toBe(DEFAULT_CORE_URL);
  });

  it("is the Vite dev server when SPARSTROW_DEV=1", () => {
    expect(resolveLocalUiUrl({ SPARSTROW_DEV: "1" })).toBe(DEFAULT_DEV_UI_URL);
  });

  it("honours explicit overrides on each side", () => {
    expect(resolveLocalUiUrl({ SPARSTROW_DEV: "1", SPARSTROW_UI_URL: "http://x:1" })).toBe("http://x:1");
    expect(resolveLocalUiUrl({ SPARSTROW_CORE_URL: "http://y:2" })).toBe("http://y:2");
  });

  it("treats any SPARSTROW_DEV value other than exactly \"1\" as not-dev", () => {
    // Matching main.ts's original comparison rather than being clever about it:
    // "true" and "0" both mean packaged here, and that predates M7.
    expect(resolveLocalUiUrl({ SPARSTROW_DEV: "true" })).toBe(DEFAULT_CORE_URL);
    expect(resolveLocalUiUrl({ SPARSTROW_DEV: "0" })).toBe(DEFAULT_CORE_URL);
  });
});

describe("resolveAppUrl", () => {
  it("falls back to the local UI when unset — today's behaviour, unchanged", () => {
    expect(resolveAppUrl({})).toBe(DEFAULT_CORE_URL);
    expect(resolveAppUrl({ SPARSTROW_DEV: "1" })).toBe(DEFAULT_DEV_UI_URL);
  });

  it("never invents a production hostname", () => {
    // A default naming a domain nobody has registered would turn "not deployed
    // yet" into a DNS error the user cannot act on.
    const resolved = resolveAppUrl({});
    expect(resolved).toContain("127.0.0.1");
  });

  it("uses the hosted app when configured", () => {
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://app.example.com" })).toBe(
      "https://app.example.com",
    );
  });

  it("strips trailing slashes so the URL is one value, not two", () => {
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://app.example.com/" })).toBe(
      "https://app.example.com",
    );
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "https://app.example.com///" })).toBe(
      "https://app.example.com",
    );
  });

  it("treats empty and whitespace-only as unset", () => {
    // `SPARSTROW_APP_URL=` in an env file is someone clearing the value, not
    // asking the window to load the empty string.
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "" })).toBe(DEFAULT_CORE_URL);
    expect(resolveAppUrl({ SPARSTROW_APP_URL: "   " })).toBe(DEFAULT_CORE_URL);
  });

  it("does not read SPARSTROW_CLOUD_URL — the daemon's target is not the window's", () => {
    const env = { SPARSTROW_CLOUD_URL: "https://cloud.example.com" } as Record<string, string>;
    expect(resolveAppUrl(env)).toBe(DEFAULT_CORE_URL);
  });
});

describe("isLocalFallback", () => {
  it("is true when unset, so the startup log can say so", () => {
    expect(isLocalFallback({})).toBe(true);
  });

  it("is false when a hosted app is configured", () => {
    expect(isLocalFallback({ SPARSTROW_APP_URL: "https://app.example.com" })).toBe(false);
  });

  it("is true when the configured value happens to BE the local UI", () => {
    // Pointing the variable at the local core explicitly is still the local
    // product; the log should not claim a hosted app is loaded.
    expect(isLocalFallback({ SPARSTROW_APP_URL: DEFAULT_CORE_URL })).toBe(true);
  });
});
