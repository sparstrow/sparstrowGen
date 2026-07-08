import { describe, expect, it } from "vitest";
import type { ProviderHealth } from "@sparstrow/shared";
import type { RunContext } from "../memory/agent-memory.js";
import type { ChatRequest, ChatTurn, DirectApiProvider } from "../providers/types.js";
import { runToolLoop } from "./tool-loop.js";

/** A scripted provider: returns pre-canned turns in order. Records requests seen. */
class FakeProvider implements DirectApiProvider {
  readonly id = "anthropic-api" as const;
  readonly kind = "direct_api" as const;
  readonly requiresApiKey = false;
  calls = 0;
  seen: ChatRequest[] = [];
  constructor(private readonly turns: ChatTurn[]) {}
  listModels() {
    return [];
  }
  price() {
    return { inputPerMTok: 5, outputPerMTok: 25 };
  }
  async chat(req: ChatRequest): Promise<ChatTurn> {
    // Snapshot — the loop reuses (and mutates) the same messages array across turns.
    this.seen.push(structuredClone(req));
    return this.turns[Math.min(this.calls++, this.turns.length - 1)]!;
  }
  async discoverModels() {
    return [];
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { id: this.id, ok: true, version: null, authenticated: null, detail: null };
  }
}

const ctx = { runId: "run_x", taskId: null } as unknown as RunContext;

function collect() {
  const events: { type: string; payload: unknown }[] = [];
  return { events, emit: (type: string, payload: unknown) => events.push({ type, payload }) };
}

const base = {
  ctx,
  model: "claude-opus-4-8",
  system: "you are a test agent",
  effectiveTools: null,
  maxTurns: 24,
  maxTokens: 16_000,
};

describe("runToolLoop (P8 provider-agnostic tool-loop)", () => {
  it("dispatches a tool call in-process then finishes on end_turn", async () => {
    const provider = new FakeProvider([
      {
        content: [
          { type: "text", text: "let me check" },
          { type: "tool_use", id: "t1", name: "ping", input: {} },
        ],
        toolCalls: [{ id: "t1", name: "ping", input: {} }],
        text: "let me check",
        stopReason: "tool_use",
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      {
        content: [{ type: "text", text: "all done" }],
        toolCalls: [],
        text: "all done",
        stopReason: "end_turn",
        usage: { inputTokens: 200, outputTokens: 20 },
      },
    ]);
    const { events, emit } = collect();
    const result = await runToolLoop({ ...base, provider, userPrompt: "do it", emit, signal: new AbortController().signal });

    expect(result.isError).toBe(false);
    expect(result.resultText).toBe("all done");
    expect(result.numTurns).toBe(2);
    expect(result.costUsd).toBeGreaterThan(0);

    // Event stream: assistant → user(tool_result) → assistant, mirroring the CLI.
    expect(events.map((e) => e.type)).toEqual(["assistant", "user", "assistant"]);
    const toolResult = events[1]!.payload as { message: { content: { type: string; is_error: boolean; content: string }[] } };
    expect(toolResult.message.content[0]!.type).toBe("tool_result");
    // "ping" is not a registry tool → dispatch degrades to an isError result.
    expect(toolResult.message.content[0]!.is_error).toBe(true);
    expect(toolResult.message.content[0]!.content).toMatch(/unknown tool/);

    // The provider was given the assembled prompt as the first user turn + system.
    expect(provider.seen[0]!.system).toBe("you are a test agent");
    expect(provider.seen[0]!.messages[0]!.content[0]).toEqual({ type: "text", text: "do it" });
    // Second turn carries the tool_result back to the provider.
    expect(provider.seen[1]!.messages.at(-1)!.content[0]!.type).toBe("tool_result");
  });

  it("caps runaway loops at maxTurns and reports an error", async () => {
    const alwaysTool: ChatTurn = {
      content: [{ type: "tool_use", id: "t", name: "ping", input: {} }],
      toolCalls: [{ id: "t", name: "ping", input: {} }],
      text: "",
      stopReason: "tool_use",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    const provider = new FakeProvider([alwaysTool]);
    const { emit } = collect();
    const result = await runToolLoop({ ...base, maxTurns: 3, provider, userPrompt: "loop", emit, signal: new AbortController().signal });
    expect(result.isError).toBe(true);
    expect(result.numTurns).toBe(3);
    expect(result.errorMessage).toMatch(/exceeded 3 turns/);
  });

  it("a refusal stop ends the loop as an error", async () => {
    const provider = new FakeProvider([
      { content: [], toolCalls: [], text: "", stopReason: "refusal", usage: { inputTokens: 5, outputTokens: 0 } },
    ]);
    const { emit } = collect();
    const result = await runToolLoop({ ...base, provider, userPrompt: "bad", emit, signal: new AbortController().signal });
    expect(result.isError).toBe(true);
    expect(result.errorMessage).toMatch(/refused/);
  });

  it("respects a pre-aborted signal (cancel)", async () => {
    const provider = new FakeProvider([
      { content: [{ type: "text", text: "x" }], toolCalls: [], text: "x", stopReason: "end_turn", usage: { inputTokens: 1, outputTokens: 1 } },
    ]);
    const controller = new AbortController();
    controller.abort();
    const { emit } = collect();
    const result = await runToolLoop({ ...base, provider, userPrompt: "x", emit, signal: controller.signal });
    expect(result.isError).toBe(true);
    expect(result.errorMessage).toBe("cancelled");
    expect(provider.calls).toBe(0); // never called the model
  });
});
