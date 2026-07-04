import { describe, expect, it } from "vitest";
import type { Agent } from "@sparstrow/shared";
import { buildPreamble } from "./preamble.js";

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
