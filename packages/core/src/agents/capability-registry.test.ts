import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITIES,
  OWNED_CAPABILITY_NAMES,
  registerCapabilities,
  renderCapabilityDocs,
} from "./capability-registry.js";
import { CAPABILITY_DOCS } from "./capability-docs.js";

describe("capability registry (rule 20)", () => {
  it("every owned capability has both a handler and params — no half-registered tool", () => {
    for (const cap of AGENT_CAPABILITIES) {
      expect(cap.handler, `${cap.name} missing handler`).toBeTruthy();
      expect(cap.params, `${cap.name} missing params`).toBeTruthy();
    }
  });

  it("single source can't drift: every owned capability is documented in CAPABILITY_DOCS", () => {
    const documented = new Set(CAPABILITY_DOCS.map((d) => d.name));
    for (const name of OWNED_CAPABILITY_NAMES) {
      expect(documented.has(name), `${name} is owned but not documented`).toBe(true);
    }
  });

  it("registerCapabilities registers exactly the owned capabilities into an MCP server", () => {
    const registered: string[] = [];
    const fakeServer = { tool: (name: string) => registered.push(name) } as never;
    registerCapabilities(fakeServer, { runId: "run_x", agent: {}, projectSlug: null, taskId: null } as never);
    expect(registered.sort()).toEqual([...OWNED_CAPABILITY_NAMES].sort());
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
