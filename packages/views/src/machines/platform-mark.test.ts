import { describe, expect, it } from "vitest";
import { platformLabel } from "./platform-mark";

/**
 * `platformLabel` shares `normalise` with `PlatformMark`, so testing the label
 * pins which mark gets rendered without needing to render anything.
 *
 * This file exists because of one specific defect, and the first test is it.
 */
describe("platformLabel", () => {
  it("does not let a substring test for Windows swallow darwin", () => {
    // `"darwin".includes("win")` is TRUE. The first version of this shipped a
    // Windows logo next to every Mac, and it typechecked perfectly.
    expect(platformLabel("darwin")).toBe("macOS");
  });

  it("maps the three values a daemon actually reports", () => {
    expect(platformLabel("win32")).toBe("Windows");
    expect(platformLabel("darwin")).toBe("macOS");
    expect(platformLabel("linux")).toBe("Linux");
  });

  it("is not confused by case or surrounding whitespace", () => {
    expect(platformLabel("  Win32 ")).toBe("Windows");
    expect(platformLabel("DARWIN")).toBe("macOS");
  });

  it("recognises human-written descriptions too", () => {
    expect(platformLabel("Windows 11 Pro")).toBe("Windows");
    expect(platformLabel("macOS Sequoia")).toBe("macOS");
    expect(platformLabel("Ubuntu 24.04")).toBe("Linux");
  });

  it("passes an unrecognised OS through rather than guessing", () => {
    // A wrong mark is worse than no mark: it asserts something false about the
    // machine, and the reader has no way to tell it apart from a right one.
    expect(platformLabel("freebsd")).toBe("freebsd");
    expect(platformLabel("plan9")).toBe("plan9");
  });

  it("says something sensible when the OS is missing entirely", () => {
    expect(platformLabel(null)).toBe("Unknown OS");
    expect(platformLabel(undefined)).toBe("Unknown OS");
    expect(platformLabel("")).toBe("Unknown OS");
  });
});
