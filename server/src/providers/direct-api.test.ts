import { describe, expect, it } from "vitest";
import { parseAnthropicMessage } from "./anthropic.js";
import { parseOllamaMessage } from "./ollama.js";

describe("parseAnthropicMessage (wire → normalized ChatTurn)", () => {
  it("splits text + tool_use and maps the stop reason + usage", () => {
    const turn = parseAnthropicMessage({
      content: [
        { type: "text", text: "hello" },
        { type: "tool_use", id: "toolu_1", name: "task_block", input: { taskId: "t1" } },
        { type: "thinking", text: "ignored" },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 120, output_tokens: 44 },
    });
    expect(turn.text).toBe("hello");
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.toolCalls).toEqual([{ id: "toolu_1", name: "task_block", input: { taskId: "t1" } }]);
    // thinking blocks are dropped from the loop history.
    expect(turn.content.filter((b) => b.type === "text")).toHaveLength(1);
    expect(turn.usage).toEqual({ inputTokens: 120, outputTokens: 44 });
  });

  it("maps end_turn and unknown stop reasons", () => {
    expect(parseAnthropicMessage({ content: [{ type: "text", text: "x" }], stop_reason: "end_turn" }).stopReason).toBe("end_turn");
    expect(parseAnthropicMessage({ content: [], stop_reason: "pause_turn" }).stopReason).toBe("other");
    expect(parseAnthropicMessage({ content: [], stop_reason: "refusal" }).stopReason).toBe("refusal");
  });
});

describe("parseOllamaMessage (wire → normalized ChatTurn)", () => {
  it("synthesizes ids for id-less tool calls and reports tool_use", () => {
    const turn = parseOllamaMessage({
      message: {
        role: "assistant",
        content: "working",
        tool_calls: [{ function: { name: "task_block", arguments: { a: 1 } } }],
      },
      prompt_eval_count: 30,
      eval_count: 12,
    });
    expect(turn.text).toBe("working");
    expect(turn.stopReason).toBe("tool_use");
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]!.name).toBe("task_block");
    expect(turn.toolCalls[0]!.id).toMatch(/^ollama_/); // synthesized, stable
    expect(turn.usage).toEqual({ inputTokens: 30, outputTokens: 12 });
  });

  it("plain text with no tool calls is end_turn", () => {
    const turn = parseOllamaMessage({ message: { role: "assistant", content: "answer" }, done_reason: "stop" });
    expect(turn.stopReason).toBe("end_turn");
    expect(turn.toolCalls).toHaveLength(0);
    expect(turn.text).toBe("answer");
  });

  it("length done_reason maps to max_tokens", () => {
    expect(parseOllamaMessage({ message: { role: "assistant", content: "x" }, done_reason: "length" }).stopReason).toBe("max_tokens");
  });
});
