import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "@sparstrow/shared";
import { closeDb, openDb } from "../db/connection.js";
import { settings } from "../db/schema.js";
import { ClaudeCodeProvider } from "../providers/claude-code.js";
import { readGlobalToolPolicy, resolveRunEffectiveTools } from "./tool-resolution.js";

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

    const spec = provider.buildHeadlessSpawn(liveAgent, "prompt", {
      runId: "run_1",
      tempDir: process.cwd(),
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
