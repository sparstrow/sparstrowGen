import { afterEach, describe, expect, it } from "vitest";
import { nativePickerAvailable, pickDirectoryNative } from "./directory-picker.js";

const host = globalThis as { sparstrowDesktop?: unknown };

afterEach(() => {
  delete host.sparstrowDesktop;
});

describe("nativePickerAvailable — 001 FR-008", () => {
  it("is false in a plain browser, where the shell was never injected", () => {
    expect(nativePickerAvailable()).toBe(false);
  });

  it("is false in a shell that predates this feature", () => {
    // The 0004 update shell exposes sparstrowDesktop with only `updates`.
    // Probing the object rather than the function would throw here instead of
    // falling back to the in-app browser.
    host.sparstrowDesktop = { updates: {} };
    expect(nativePickerAvailable()).toBe(false);
  });

  it("is false when dialogs exists but pickDirectory is not callable", () => {
    host.sparstrowDesktop = { dialogs: { pickDirectory: "nope" } };
    expect(nativePickerAvailable()).toBe(false);
  });

  it("is true once the shell exposes the function", () => {
    host.sparstrowDesktop = { dialogs: { pickDirectory: async () => null } };
    expect(nativePickerAvailable()).toBe(true);
  });
});

describe("pickDirectoryNative", () => {
  it("passes the default path through and returns the chosen directory", async () => {
    const seen: (string | undefined)[] = [];
    host.sparstrowDesktop = {
      dialogs: {
        pickDirectory: async (defaultPath?: string) => {
          seen.push(defaultPath);
          return "C:\\Projects\\my-app";
        },
      },
    };
    await expect(pickDirectoryNative("C:\\Projects")).resolves.toBe("C:\\Projects\\my-app");
    expect(seen).toEqual(["C:\\Projects"]);
  });

  it("returns null when the dialog was cancelled", async () => {
    host.sparstrowDesktop = { dialogs: { pickDirectory: async () => null } };
    await expect(pickDirectoryNative()).resolves.toBeNull();
  });

  it("throws rather than silently doing nothing when no shell is present", () => {
    expect(() => pickDirectoryNative()).toThrow(/unavailable/);
  });
});
