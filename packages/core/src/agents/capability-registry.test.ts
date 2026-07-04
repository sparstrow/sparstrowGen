import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITIES,
  registerCapabilities,
  renderCapabilityDocs,
} from "./capability-registry.js";

describe("capability registry (rule 20)", () => {
  it("every owned capability (has handler) also declares params — no half-registered tool", () => {
    for (const cap of AGENT_CAPABILITIES) {
      if (cap.handler) expect(cap.params, `${cap.name} has a handler but no params`).toBeTruthy();
      if (cap.params) expect(cap.handler, `${cap.name} has params but no handler`).toBeTruthy();
    }
  });

  it("registerCapabilities registers exactly the owned capabilities into an MCP server", () => {
    const registered: string[] = [];
    const fakeServer = { tool: (name: string) => registered.push(name) } as never;
    registerCapabilities(fakeServer, { runId: "run_x", agent: {}, projectSlug: null } as never);
    const owned = AGENT_CAPABILITIES.filter((c) => c.handler).map((c) => c.name);
    expect(registered.sort()).toEqual(owned.sort());
    // task_block is the first owned capability.
    expect(registered).toContain("task_block");
  });

  it("preamble docs group by intent and carry the escalation ladder", () => {
    const docs = renderCapabilityDocs();
    expect(docs).toContain("## Your tools, by intent");
    expect(docs).toContain("`task_block`");
    expect(docs).toContain("**Escalate**");
    expect(docs).toContain("Escalation ladder");
    // The ladder distinguishes the three escalation paths.
    expect(docs).toMatch(/message_send.*lead/);
    expect(docs).toMatch(/task_block.*human/);
  });

  it("docs can be filtered to an agent's available tool set", () => {
    const docs = renderCapabilityDocs(["task_block", "memory_search"]);
    expect(docs).toContain("`task_block`");
    expect(docs).toContain("`memory_search`");
    expect(docs).not.toContain("`task_create`");
  });
});
