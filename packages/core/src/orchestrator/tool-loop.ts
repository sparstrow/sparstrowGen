import type { EffectiveTools, RunResult } from "@sparstrow/shared";
import { dispatchCapability, nativeToolSchemas, toolResultText } from "../agents/capability-registry.js";
import type { RunContext } from "../memory/agent-memory.js";
import { logger } from "../logger.js";
import type { ChatBlock, ChatMessage, DirectApiProvider } from "../providers/types.js";

/**
 * P8 (★ foundational) — the provider-agnostic tool-call loop. This is the
 * direct-API counterpart to the CLI's spawn→stream→finalize path (EM2): instead
 * of a child process, core drives the model turn-by-turn, dispatching tool calls
 * IN-PROCESS via the capability registry (rule 20 — the exact same tools a CLI
 * agent gets over MCP). Every turn is emitted as a `run_events` row shaped
 * identically to the CLI's stream-json, so the Runs UI is provider-agnostic.
 *
 * The loop owns the message history (natural resume point), but the universal
 * contract stays fresh-run-with-injected-context (P1-Q1): the caller assembles
 * the same preamble/memory/task prompt the CLI gets and hands it in as the first
 * user turn.
 */

export interface ToolLoopInput {
  provider: DirectApiProvider;
  /** Resolved run context — powers in-process capability dispatch (task_block, spawn_subtask…). */
  ctx: RunContext;
  model: string;
  /** The agent's system prompt (mirrors the CLI's --append-system-prompt). */
  system: string;
  /** The assembled preamble + directives + memory + task (the CLI's stdin prompt). */
  userPrompt: string;
  /** Immutable per-run tool snapshot (EH5) — filters the advertised native tools. */
  effectiveTools: EffectiveTools | null;
  maxTurns: number;
  maxTokens: number;
  /** Emit one normalized run event (recorded + published exactly like a CLI line). */
  emit: (type: string, payload: unknown) => void;
  signal: AbortSignal;
}

/** Anthropic-style content blocks — the shape the Runs UI already renders for CLI runs. */
function toDisplayContent(blocks: ChatBlock[]): unknown[] {
  return blocks.map((b) => {
    switch (b.type) {
      case "text":
        return { type: "text", text: b.text };
      case "tool_use":
        return { type: "tool_use", id: b.id, name: b.name, input: b.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: b.toolUseId,
          content: b.content,
          is_error: b.isError ?? false,
        };
    }
  });
}

export async function runToolLoop(input: ToolLoopInput): Promise<RunResult> {
  const { provider, ctx, emit, signal } = input;
  const tools = nativeToolSchemas(input.effectiveTools).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  const messages: ChatMessage[] = [
    { role: "user", content: [{ type: "text", text: input.userPrompt }] },
  ];
  const price = provider.price(input.model);
  let costUsd = 0;
  let turns = 0;
  let lastText: string | null = null;

  while (turns < input.maxTurns) {
    if (signal.aborted) return { resultText: lastText, costUsd, numTurns: turns, sessionId: null, isError: true, errorMessage: "cancelled" };
    turns += 1;

    let turn;
    try {
      turn = await provider.chat(
        { model: input.model, system: input.system, messages, tools, maxTokens: input.maxTokens },
        signal,
      );
    } catch (err) {
      if (signal.aborted) {
        return { resultText: lastText, costUsd, numTurns: turns, sessionId: null, isError: true, errorMessage: "cancelled" };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { resultText: lastText, costUsd, numTurns: turns, sessionId: null, isError: true, errorMessage: message };
    }

    if (price) {
      costUsd +=
        (turn.usage.inputTokens / 1e6) * price.inputPerMTok +
        (turn.usage.outputTokens / 1e6) * price.outputPerMTok;
    }
    if (turn.text.length > 0) lastText = turn.text;

    // Emit the assistant turn (CLI-shaped) so the Runs UI renders it uniformly.
    emit("assistant", { type: "assistant", message: { role: "assistant", content: toDisplayContent(turn.content) } });
    messages.push({ role: "assistant", content: turn.content });

    if (turn.stopReason === "refusal") {
      return { resultText: lastText, costUsd, numTurns: turns, sessionId: null, isError: true, errorMessage: "model refused the request" };
    }
    if (turn.toolCalls.length === 0) {
      // No tools requested → the turn's text is the final answer.
      return {
        resultText: lastText,
        costUsd,
        numTurns: turns,
        sessionId: null,
        isError: turn.stopReason === "max_tokens",
        errorMessage: turn.stopReason === "max_tokens" ? "hit max output tokens" : undefined,
      };
    }

    // Dispatch every requested tool in-process, then return ALL results in one
    // user turn (the provider expects them paired to their tool_use ids).
    const resultBlocks: ChatBlock[] = [];
    for (const call of turn.toolCalls) {
      const result = await dispatchCapability(call.name, call.input, ctx, input.effectiveTools);
      resultBlocks.push({
        type: "tool_result",
        toolUseId: call.id,
        content: toolResultText(result) || "(no output)",
        isError: result.isError === true,
      });
    }
    emit("user", { type: "user", message: { role: "user", content: toDisplayContent(resultBlocks) } });
    messages.push({ role: "user", content: resultBlocks });
  }

  logger.warn({ runId: ctx.runId, maxTurns: input.maxTurns }, "tool-loop hit max turns");
  return {
    resultText: lastText,
    costUsd,
    numTurns: turns,
    sessionId: null,
    isError: true,
    errorMessage: `tool-loop exceeded ${input.maxTurns} turns without completing`,
  };
}
