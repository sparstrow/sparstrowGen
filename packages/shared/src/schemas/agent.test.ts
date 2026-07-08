import { describe, expect, it } from "vitest";
import { agentCreateSchema, executionModeForProvider, providerIdSchema } from "./agent.js";

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
  it("accepts the CLI + P8 direct-API providers (codex is dropped)", () => {
    expect(providerIdSchema.options).toEqual([
      "claude-code",
      "antigravity",
      "anthropic-api",
      "ollama",
    ]);
    expect(providerIdSchema.safeParse("codex").success).toBe(false);
  });

  it("derives execution mode from the provider id (no stored column)", () => {
    expect(executionModeForProvider("claude-code")).toBe("cli");
    expect(executionModeForProvider("antigravity")).toBe("cli");
    expect(executionModeForProvider("anthropic-api")).toBe("direct_api");
    expect(executionModeForProvider("ollama")).toBe("direct_api");
    expect(executionModeForProvider("something-else")).toBe("cli");
  });
});
