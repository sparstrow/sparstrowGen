import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@sparstrow/shared";
import { closeDb, openDb } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { ClaudeCodeProvider } from "../providers/claude-code.js";
import { readGlobalToolPolicy, resolveRunEffectiveTools, cacheWorkspacePolicy } from "./tool-resolution.js";
import { vi } from "vitest";

vi.mock("../cloud/commands.js", () => {
  return {
    isControlPlaneHealthy: vi.fn(() => true),
  };
});
import { isControlPlaneHealthy } from "../cloud/commands.js";

const agent = (allowedTools: string[], disallowedTools: string[]) =>
  ({ allowedTools, disallowedTools }) as unknown as Agent & {
    allowedTools: string[];
    disallowedTools: string[];
  };

describe("resolveRunEffectiveTools — global settings + hierarchy", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
  });
  afterEach(() => closeDb());

  it("reads the global tool policy from settings and folds it in", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.disallowed", value: JSON.stringify(["Bash"]) }).run();
    expect(readGlobalToolPolicy()).toEqual({ allowed: [], disallowed: ["Bash"] });

    const eff = resolveRunEffectiveTools({
      agent: agent(["Bash", "Read"], []),
      project: { allowedTools: [], disallowedTools: [] },
      task: null,
    });
    // Global disallow of Bash wins over the agent's grant.
    expect(eff.allowed).toEqual(["Read"]);
    expect(eff.disallowed).toEqual(["Bash"]);
  });

  it("tolerates malformed settings JSON (treats as empty)", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.allowed", value: "not json" }).run();
    expect(readGlobalToolPolicy().allowed).toEqual([]);
  });

  it("P3/S1-a: a delegated task's parent bound clamps the child's resolution (LEAST)", () => {
    openDb(":memory:");
    const eff = resolveRunEffectiveTools({
      // The child's own agent grants Bash + Edit + Read...
      agent: agent(["Bash", "Edit", "Read"], []),
      task: {
        allowedTools: [],
        disallowedTools: [],
        // ...but the delegating run could only ever use Read/Edit, no Bash.
        parentEffectiveTools: { allowed: ["Read", "Edit"], disallowed: ["Bash"] },
      },
    });
    expect(eff.allowed).toEqual(["Edit", "Read"]);
    expect(eff.disallowed).toContain("Bash");
  });
});

describe("EH5 TOCTOU: claude-code reads the immutable snapshot, not the live agent row", () => {
  it("uses the effectiveTools snapshot for --allowedTools/--disallowedTools", () => {
    const provider = new ClaudeCodeProvider();
    // Live agent row grants Bash; the snapshot (resolved earlier) denies it.
    const liveAgent = {
      model: "claude-sonnet-5",
      allowedTools: ["Bash", "Read"],
      disallowedTools: [],
      mcpServers: {},
      addDirs: [],
      permissionMode: "default",
      systemPrompt: "",
      extraArgs: [],
      maxTurns: null,
    } as unknown as Agent;

    // A real temp dir — with cwd the provider leaks mcp-config.json into the repo.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sparstrow-test-"));
    const spec = provider.buildHeadlessSpawn(liveAgent, "prompt", {
      runId: "run_1",
      tempDir,
      sessionId: "sess_1",
      effectiveTools: { allowed: ["Read"], disallowed: ["Bash"] },
    });
    const joined = spec.args.join(" ");
    // The snapshot wins: Bash is disallowed, Read allowed — NOT the live agent's grant.
    expect(joined).toContain("--disallowedTools Bash");
    const allowedArg = spec.args[spec.args.indexOf("--allowedTools") + 1] ?? "";
    expect(allowedArg).toContain("Read");
    expect(allowedArg).not.toContain("Bash");
  });
});

import { _resetWorkspacePolicyCache } from "./tool-resolution.js";

describe("readGlobalToolPolicy - cloud policy fallback (DD-3)", () => {
  beforeEach(() => {
    closeDb();
    openDb(":memory:");
    _resetWorkspacePolicyCache();
  });
  afterEach(() => closeDb());

  it("cloud reachable returns cloud value", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.disallowed", value: JSON.stringify(["Edit"]) }).run();
    cacheWorkspacePolicy({ allowedTools: ["Bash", "Read"], disallowedTools: ["Edit"] });
    vi.mocked(isControlPlaneHealthy).mockReturnValue(true);
    
    const policy = readGlobalToolPolicy();
    expect(policy.allowed).toEqual(["Bash", "Read"]);
    expect(policy.disallowed).toEqual(["Edit"]);
  });

  it("cloud unreachable with a cached value that is stricter", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.allowed", value: JSON.stringify(["Bash", "Read"]) }).run();
    
    // Cloud cached has no Bash, so it is stricter
    cacheWorkspacePolicy({ allowedTools: ["Read"], disallowedTools: [] });
    vi.mocked(isControlPlaneHealthy).mockReturnValue(false);
    
    const policy = readGlobalToolPolicy();
    expect(policy.allowed).toEqual(["Read"]);
  });

  it("cloud unreachable with local rows that are stricter", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.disallowed", value: JSON.stringify(["Edit"]) }).run();
    cacheWorkspacePolicy({ allowedTools: ["Read"], disallowedTools: ["Bash"] });
    vi.mocked(isControlPlaneHealthy).mockReturnValue(false);
    
    const policy = readGlobalToolPolicy();
    expect(policy.disallowed).toContain("Edit");
    expect(policy.disallowed).toContain("Bash");
  });

  it("never reached", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.disallowed", value: JSON.stringify(["Write"]) }).run();
    
    const policy = readGlobalToolPolicy();
    expect(policy.disallowed).toEqual(["Write"]);
  });

  it("unreachable path can never return a superset of the last cached cloud policy", () => {
    const db = openDb(":memory:").db;
    db.insert(settings).values({ key: "tools.global.allowed", value: JSON.stringify(["Bash", "Read", "Edit", "Delete"]) }).run();
    
    cacheWorkspacePolicy({ allowedTools: ["Read"], disallowedTools: [] });
    vi.mocked(isControlPlaneHealthy).mockReturnValue(false);
    
    const policy = readGlobalToolPolicy();
    expect(policy.allowed).toEqual(["Read"]);
  });
});

