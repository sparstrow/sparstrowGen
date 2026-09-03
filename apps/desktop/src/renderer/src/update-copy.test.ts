import { describe, expect, it } from "vitest";
import { isNewsworthy, updateStatusLine } from "./update-copy";

describe("updateStatusLine", () => {
  it("distinguishes 'still asking' from 'cannot update'", () => {
    // The bug this pins: `supported` used to be `Boolean(bridge)`, which is
    // true in every build — including unpackaged ones, where the IPC handlers
    // do not exist. Settings then showed a working updater and a Check button
    // that threw. `null` has to keep meaning "outstanding", not "no".
    expect(updateStatusLine({ state: "idle" }, null)).toMatch(/Checking whether/);
    expect(updateStatusLine({ state: "idle" }, false)).toMatch(/cannot update itself/);
    expect(updateStatusLine({ state: "idle" }, false)).not.toMatch(/30 minutes/);
  });

  it("never claims the app is up to date when it has only not looked", () => {
    // `idle` covers both "checked, nothing new" and "not checked yet". Saying
    // "up to date" would be a claim only one of those supports.
    const line = updateStatusLine({ state: "idle" }, true);
    expect(line).not.toMatch(/up to date/i);
    expect(line).toMatch(/No new version has been found/);
  });

  it("names the version in every state that has one", () => {
    expect(updateStatusLine({ state: "available", version: "0.4.0" }, true)).toContain("0.4.0");
    expect(
      updateStatusLine({ state: "downloading", version: "0.4.0", percent: 42 }, true),
    ).toContain("42%");
    expect(updateStatusLine({ state: "downloaded", version: "0.4.0" }, true)).toContain("0.4.0");
    expect(updateStatusLine({ state: "installing", version: "0.4.0" }, true)).toContain("0.4.0");
    expect(
      updateStatusLine({ state: "waiting", version: "0.4.0", busy: 2, runs: [] }, true),
    ).toContain("0.4.0");
  });

  it("does not put a raw error message in the summary line", () => {
    // The message is shown separately, in its own destructive-styled block. A
    // stack trace spliced into a sentence reads as corruption, not as an error.
    const line = updateStatusLine({ state: "error", message: "ENOTFOUND github.com" }, true);
    expect(line).not.toContain("ENOTFOUND");
  });
});

describe("isNewsworthy", () => {
  it("interrupts only for news the user can act on", () => {
    expect(isNewsworthy({ state: "available", version: "1" })).toBe(true);
    expect(isNewsworthy({ state: "downloaded", version: "1" })).toBe(true);
    expect(isNewsworthy({ state: "waiting", version: "1", busy: 1, runs: [] })).toBe(true);
  });

  it("stays quiet about a failed background check", () => {
    // A laptop closing its lid must not produce a banner. Settings still shows
    // it; the header does not.
    expect(isNewsworthy({ state: "error", message: "offline" })).toBe(false);
    expect(isNewsworthy({ state: "idle" })).toBe(false);
    expect(isNewsworthy({ state: "checking" })).toBe(false);
  });

  it("stays quiet once the install is under way", () => {
    // Nothing left to act on — the app is about to restart.
    expect(isNewsworthy({ state: "downloading", version: "1", percent: 10 })).toBe(false);
    expect(isNewsworthy({ state: "installing", version: "1" })).toBe(false);
  });
});
