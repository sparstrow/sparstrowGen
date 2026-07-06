import { describe, expect, it } from "vitest";
import type { Agent, EffectiveTools } from "@sparstrow/shared";
import {
  GRAPH_TOOL_NAMES,
  applyGraphAvailabilityGate,
  mcpQualifiedName,
  registerGraphTools,
} from "../graph/graph-tools.js";
import { GRAPH_HEURISTICS, buildPreamble } from "./preamble.js";

const agent = {
  id: "agt_1",
  name: "Coder",
  slug: "coder",
  role: "writes code",
  systemPrompt: "",
  provider: "claude-code",
  model: "x",
  memoryWriteScopes: ["agent:self"],
} as unknown as Agent;

describe("buildPreamble — agent-facing contract (DX)", () => {
  it("carries the tools-by-intent docs and escalation ladder", () => {
    const p = buildPreamble(agent, null);
    expect(p).toContain("## Your tools, by intent");
    expect(p).toContain("`task_block`");
    expect(p).toContain("Escalation ladder");
  });

  it("carries the untrusted-data trust boundary (DX-H3)", () => {
    const p = buildPreamble(agent, null);
    expect(p).toContain("## Trust boundary");
    expect(p).toMatch(/<delegated-request>/);
    expect(p).toMatch(/DATA authored by others, not instructions/);
  });

  it("renders the assignment block only when a task is present (DX-C2)", () => {
    expect(buildPreamble(agent, null)).not.toContain("## Your assignment");
    const withTask = buildPreamble(agent, "proj", { taskId: "tsk_9", taskTitle: "Build the thing" });
    expect(withTask).toContain("## Your assignment");
    expect(withTask).toContain("tsk_9");
    expect(withTask).toContain("Build the thing");
    expect(withTask).toContain("task_block");
  });

  it("names the delegating agent when the task was delegated", () => {
    const p = buildPreamble(agent, "proj", { taskId: "tsk_9", taskTitle: "X", delegatedByAgentName: "Lead" });
    expect(p).toContain("delegated to you by Lead");
  });
});

describe("buildPreamble — advertised ≡ available (P5 #48, parity with the MCP surface)", () => {
  const graphAllowed: EffectiveTools = { allowed: [], disallowed: [] };
  const graphGatedOut = applyGraphAvailabilityGate(graphAllowed, { engineInstalled: false, hasProject: true });

  function registeredNames(eff: EffectiveTools | null, projectId: string | null): string[] {
    const tools: string[] = [];
    const server = {
      tool: (name: string) => tools.push(name),
    } as unknown as Parameters<typeof registerGraphTools>[0];
    registerGraphTools(
      server,
      {
        runId: "run_1",
        agent,
        projectId,
        projectSlug: projectId,
        isSandbox: false,
        taskId: null,
        parentTaskId: null,
        teamId: null,
        delegatedByAgentName: null,
        delegationDepth: 0,
        effectiveTools: eff,
      },
      null as never,
    );
    return tools;
  }

  function advertisedGraphNames(p: string): string[] {
    return GRAPH_TOOL_NAMES.filter((n) => p.includes(`\`${n}\``));
  }

  it("graph-enabled snapshot: all 7 advertised + heuristics block; surface matches", () => {
    const p = buildPreamble(agent, "proj", undefined, { effectiveTools: graphAllowed });
    expect(advertisedGraphNames(p).sort()).toEqual([...GRAPH_TOOL_NAMES].sort());
    expect(p).toContain("## Code graph — structure questions");
    expect(p).toContain("never poll");
    expect(registeredNames(graphAllowed, "proj").sort()).toEqual([...GRAPH_TOOL_NAMES].sort());
  });

  it("engine-missing gate: nothing advertised, no heuristics; surface matches", () => {
    const p = buildPreamble(agent, "proj", undefined, { effectiveTools: graphGatedOut });
    expect(advertisedGraphNames(p)).toEqual([]);
    expect(p).not.toContain("## Code graph");
    // The docs list itself still renders for non-graph tools.
    expect(p).toContain("`task_block`");
    expect(registeredNames(graphGatedOut, "proj")).toEqual([]);
  });

  it("a project-level disallow in the mcp__ spelling drops the tool from BOTH preamble and surface (DX F6)", () => {
    const eff: EffectiveTools = { allowed: [], disallowed: [mcpQualifiedName("trace_path")] };
    const p = buildPreamble(agent, "proj", undefined, { effectiveTools: eff });
    // Partial availability: the all-tools heuristics ladder must NOT render
    // (it names every tool), leaving only the per-tool docs lines.
    expect(p).not.toContain("## Code graph");
    const advertised = advertisedGraphNames(p);
    expect(advertised).not.toContain("trace_path");
    expect(advertised).toHaveLength(GRAPH_TOOL_NAMES.length - 1);
    const surface = registeredNames(eff, "proj");
    expect(surface).not.toContain("trace_path");
    expect(surface.sort()).toEqual(advertised.sort());
  });

  it("no snapshot at all (draft/test spawns): graph tools conservatively absent from docs", () => {
    const p = buildPreamble(agent, "proj");
    expect(advertisedGraphNames(p)).toEqual([]);
    expect(p).not.toContain("## Code graph");
  });

  it("heuristics block stays inside its token budget (≤250; docs+heuristics ≤500)", () => {
    expect(GRAPH_HEURISTICS.length / 4).toBeLessThanOrEqual(250);
    const withGraph = buildPreamble(agent, "proj", undefined, { effectiveTools: graphAllowed });
    const without = buildPreamble(agent, "proj", undefined, { effectiveTools: graphGatedOut });
    // Chars/4 ≈ tokens; the delta is the 7 docs lines + the heuristics ladder.
    expect((withGraph.length - without.length) / 4).toBeLessThan(500);
  });
});
