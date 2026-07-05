import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../config.js";
import { getProjectGitState } from "./git-status.js";

describe("getProjectGitState (read-only git awareness)", () => {
  it("returns a graceful state for a null rootDir", async () => {
    const s = await getProjectGitState(null);
    expect(s.isRepo).toBe(false);
    expect(s.error).toMatch(/no rootDir/);
    expect(s.recentCommits).toEqual([]);
  });

  it("returns a graceful state for a non-existent rootDir (no throw)", async () => {
    const s = await getProjectGitState(path.join(os.tmpdir(), "sparstrow-does-not-exist-xyz"));
    expect(s.isRepo).toBe(false);
    expect(s.error).toMatch(/does not exist/);
  });

  it("reports a plain folder as not-a-repo", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-plain-"));
    try {
      const s = await getProjectGitState(dir);
      // If git is unavailable on the host we can't distinguish — accept either.
      if (s.available) {
        expect(s.isRepo).toBe(false);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports the repo it runs inside as a work tree with a branch", async () => {
    const s = await getProjectGitState(repoRoot);
    if (!s.available) return; // git not installed in this environment — skip
    expect(s.isRepo).toBe(true);
    expect(typeof s.branch === "string" || s.branch === null).toBe(true);
    expect(s.changedFiles).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(s.recentCommits)).toBe(true);
  });
});
