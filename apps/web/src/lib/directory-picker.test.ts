import { afterEach, describe, expect, it } from "vitest";
import {
  canCreateFolder,
  displayName,
  isSingleSegment,
  nativePickerAvailable,
  pickDirectoryNative,
} from "./directory-picker.js";

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

describe("canCreateFolder — 001 FR-016", () => {
  it("offers New folder for the modes whose target should not exist yet", () => {
    expect(canCreateFolder("scratch")).toBe(true);
    expect(canCreateFolder("clone")).toBe(true);
  });

  it("does NOT offer it when binding an existing folder", () => {
    // The assertion most likely to be forgotten: the affordance being present
    // is what gets tested, and its absence is the actual requirement.
    expect(canCreateFolder("bind")).toBe(false);
  });
});

describe("isSingleSegment — 001 FR-017", () => {
  it("accepts an ordinary folder name", () => {
    expect(isSingleSegment("my-app")).toBe(true);
    expect(isSingleSegment("  spaced  ")).toBe(true);
    expect(isSingleSegment("dots.in.name")).toBe(true);
  });

  it("rejects anything that is not exactly one segment", () => {
    for (const bad of ["", "   ", ".", "..", "../escape", "a/b", "a\\b", "C:\\abs", "/abs"]) {
      expect(isSingleSegment(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects a name over the filesystem limit", () => {
    expect(isSingleSegment("x".repeat(256))).toBe(false);
    expect(isSingleSegment("x".repeat(255))).toBe(true);
  });
});

describe("displayName", () => {
  it("shows the last segment of a nested path", () => {
    expect(displayName("C:\\Users\\gsrih\\Projects")).toBe("Projects");
    expect(displayName("/home/gsrih/projects")).toBe("projects");
  });

  it("falls back to the whole path at a volume root, which has no segment", () => {
    expect(displayName("C:\\")).toBe("C:\\");
    expect(displayName("/")).toBe("/");
  });
});
