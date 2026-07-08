import { describe, expect, it } from "vitest";
import {
  GitOpsError,
  assertPushAllowed,
  branchNameForTask,
  createAgentBranch,
  isProtectedRef,
  parseGitHubRemote,
  prTargetForProfile,
  protectedRefsForProfile,
  type ProfileContext,
} from "./git-ops.js";

const factory: ProfileContext = { profile: "factory", stagingBranch: null };
const prod: ProfileContext = { profile: "production_app", stagingBranch: "staging" };
const prodCustom: ProfileContext = { profile: "production_app", stagingBranch: "release/next" };

describe("git-ops guard rails — protected refs (core-enforced)", () => {
  it("factory protects main/master; production_app also protects the staging branch", () => {
    expect(protectedRefsForProfile(factory)).toEqual(["main", "master"]);
    expect(protectedRefsForProfile(prod)).toEqual(["main", "master", "staging"]);
    expect(protectedRefsForProfile(prodCustom)).toEqual(["main", "master", "release/next"]);
  });

  it("isProtectedRef normalizes refs/heads/, origin/, and case", () => {
    expect(isProtectedRef("main", factory)).toBe(true);
    expect(isProtectedRef("MAIN", factory)).toBe(true);
    expect(isProtectedRef("refs/heads/main", factory)).toBe(true);
    expect(isProtectedRef("origin/main", factory)).toBe(true);
    expect(isProtectedRef("staging", prod)).toBe(true);
    expect(isProtectedRef("staging", factory)).toBe(false); // not protected under factory
    expect(isProtectedRef("agent/fix-thing", prod)).toBe(false);
  });

  it("assertPushAllowed throws GitOpsError('protected_ref') on trunk, passes for agent/*", () => {
    expect(() => assertPushAllowed("main", factory)).toThrow(GitOpsError);
    expect(() => assertPushAllowed("staging", prod)).toThrow(/protected ref/);
    expect(() => assertPushAllowed("agent/fix-thing", prod)).not.toThrow();
    try {
      assertPushAllowed("main", factory);
    } catch (e) {
      expect((e as GitOpsError).code).toBe("protected_ref");
    }
  });

  it("prTargetForProfile: factory → main, production_app → its staging branch", () => {
    expect(prTargetForProfile(factory)).toBe("main");
    expect(prTargetForProfile(prod)).toBe("staging");
    expect(prTargetForProfile(prodCustom)).toBe("release/next");
    expect(prTargetForProfile({ profile: "production_app", stagingBranch: null })).toBe("staging");
  });
});

describe("git-ops — branch naming (a hostile task title can never craft trunk)", () => {
  it("always namespaces agent/, lowercases, collapses junk to single hyphens", () => {
    expect(branchNameForTask("Fix the Login Bug!")).toBe("agent/fix-the-login-bug");
    expect(branchNameForTask("  Add   OAuth  ")).toBe("agent/add-oauth");
  });

  it("cannot be coerced into a protected ref", () => {
    for (const evil of ["main", "../main", "refs/heads/main", "MAIN", "origin/main"]) {
      const b = branchNameForTask(evil);
      expect(b.startsWith("agent/")).toBe(true);
      expect(isProtectedRef(b, prod)).toBe(false);
    }
  });

  it("strips ref/shell metacharacters and caps length", () => {
    const b = branchNameForTask('x; rm -rf / && echo "$(whoami)" `id` ..//~^:');
    expect(b).toMatch(/^agent\/[a-z0-9-]+$/);
    expect(b.length).toBeLessThanOrEqual("agent/".length + 48);
  });

  it("empty / all-symbol titles still produce a valid branch", () => {
    expect(branchNameForTask("")).toBe("agent/task");
    expect(branchNameForTask("!!!")).toBe("agent/task");
  });

  it("appends a disambiguating suffix when given", () => {
    expect(branchNameForTask("Fix bug", "a1b2")).toBe("agent/fix-bug-a1b2");
  });
});

describe("git-ops — GitHub remote parsing", () => {
  it("parses ssh and https remotes, with and without .git / user", () => {
    expect(parseGitHubRemote("git@github.com:acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseGitHubRemote("git@github.com:acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseGitHubRemote("ssh://git@github.com/acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseGitHubRemote("https://github.com/acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseGitHubRemote("https://github.com/acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseGitHubRemote("https://ghuser@github.com/acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("returns null for non-GitHub or empty remotes (caller degrades)", () => {
    expect(parseGitHubRemote("https://gitlab.com/acme/widgets.git")).toBeNull();
    expect(parseGitHubRemote(null)).toBeNull();
    expect(parseGitHubRemote("")).toBeNull();
    expect(parseGitHubRemote("not a url")).toBeNull();
  });
});

describe("git-ops — createAgentBranch refuses non-agent/protected names before touching disk", () => {
  it("rejects a bare or protected branch name (no rootDir needed)", async () => {
    await expect(createAgentBranch("/does/not/matter", "main", factory)).rejects.toThrow(/agent\/\*/);
    await expect(createAgentBranch("/does/not/matter", "feature/x", factory)).rejects.toThrow(GitOpsError);
    // An agent/* name that normalizes onto staging is still refused under prod.
    await expect(createAgentBranch("/does/not/matter", "agent/ok", prod)).rejects.toThrow(/rootDir/); // passes guards, fails on missing dir
  });
});
