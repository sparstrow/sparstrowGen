import { describe, expect, it } from "vitest";
import { agentCreateSchema, providerIdSchema } from "./agent.js";

describe("agentCreateSchema", () => {
  it("applies sensible defaults from name/provider/model alone", () => {
    const agent = agentCreateSchema.parse({
      name: "Researcher",
      provider: "claude-code",
      model: "sonnet",
    });
    expect(agent.permissionMode).toBe("default");
    expect(agent.enabled).toBe(true);
    expect(agent.allowedTools).toEqual([]);
    expect(agent.memoryWriteScopes).toEqual(["agent:self"]);
    expect(agent.memoryReadScopes).toEqual(["global", "agent:self", "project:*"]);
  });
});

describe("providerIdSchema", () => {
  it("accepts only claude-code and gemini-cli (codex is dropped)", () => {
    expect(providerIdSchema.options).toEqual(["claude-code", "gemini-cli"]);
    expect(providerIdSchema.safeParse("codex").success).toBe(false);
  });
});
