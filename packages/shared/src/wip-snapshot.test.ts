import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIP_SNAPSHOT,
  DEFAULT_WIP_SNAPSHOT_KEEP,
  WIP_SNAPSHOT_REF_PREFIX,
  isWipSnapshotEnabled,
  resolveWipSnapshotKeep,
} from "./constants";

/**
 * These two functions exist in `shared` rather than in core so that the daemon
 * (which decides whether to take a snapshot) and the settings UI (which draws
 * the switch) read the setting identically. A drift here would show a toggle
 * that misreports its own state.
 */
describe("isWipSnapshotEnabled", () => {
  it("defaults to on when unset", () => {
    expect(isWipSnapshotEnabled(null)).toBe(DEFAULT_WIP_SNAPSHOT);
    expect(isWipSnapshotEnabled(undefined)).toBe(true);
  });

  it("is switched off only by an explicit falsey word, in any casing or padding", () => {
    for (const value of ["off", "OFF", " Off ", "false", "FALSE", "0", "no", "NO"]) {
      expect(isWipSnapshotEnabled(value)).toBe(false);
    }
  });

  it("stays on for anything it does not recognise", () => {
    // A typo'd or half-written value must not silently disable a feature whose
    // only job is to stop work being lost.
    for (const value of ["on", "true", "yes", "1", "", "   ", "disabled?", "nope"]) {
      expect(isWipSnapshotEnabled(value)).toBe(true);
    }
  });
});

describe("resolveWipSnapshotKeep", () => {
  it("falls back for anything not a positive integer", () => {
    for (const value of [null, undefined, "", "0", "-1", "abc", "  ", "x9"]) {
      expect(resolveWipSnapshotKeep(value)).toBe(DEFAULT_WIP_SNAPSHOT_KEEP);
    }
  });

  it("accepts a positive integer, including one with surrounding space", () => {
    expect(resolveWipSnapshotKeep("1")).toBe(1);
    expect(resolveWipSnapshotKeep("25")).toBe(25);
    expect(resolveWipSnapshotKeep(" 7 ")).toBe(7);
    // parseInt reads the leading integer and stops, rather than rejecting the
    // whole string. Keeping 1 snapshot is a defensible reading of "1.9", and
    // beats a silent fallback to 50 that the user never asked for. The settings
    // UI refuses non-digits before saving, so this is the belt to that braces.
    expect(resolveWipSnapshotKeep("1.9")).toBe(1);
    expect(resolveWipSnapshotKeep("1.5.2")).toBe(1);
  });
});

describe("WIP_SNAPSHOT_REF_PREFIX", () => {
  it("is outside refs/heads, so a snapshot is not a branch and is not pushed", () => {
    expect(WIP_SNAPSHOT_REF_PREFIX.startsWith("refs/")).toBe(true);
    expect(WIP_SNAPSHOT_REF_PREFIX.startsWith("refs/heads/")).toBe(false);
    expect(WIP_SNAPSHOT_REF_PREFIX.endsWith("/")).toBe(true);
  });
});
