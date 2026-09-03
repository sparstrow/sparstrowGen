import type { ProviderHealth } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import type { ChatBlock, ChatMessage, ChatRequest, ChatTurn, DirectApiProvider } from "./types.js";

/**
 * P8 (P8-Q2: Ollama fast-follow) — the local, key-less direct-API adapter. Proves
 * the tool-loop is genuinely provider-agnostic: the SAME loop and the SAME registry
 * schemas drive a completely different wire format (Ollama's `/api/chat` with
 * `role:"tool"` result messages and id-less tool calls). Free/local, so `price`
 * is null and no secret is needed.
 */

interface OllamaToolCall {
  function?: { name?: string; arguments?: Record<string, unknown> };
}
interface OllamaMessage {
  role: string;
  content?: string;
  tool_calls?: OllamaToolCall[];
}

/**
 * Flatten our neutral history to Ollama's message list. Ollama has no tool_use
 * ids — assistant tool calls carry name+arguments, and each tool_result becomes a
 * standalone `role:"tool"` message matched by order.
 */
function toOllamaMessages(system: string, messages: ChatMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      const toolCalls = m.content
        .filter((b): b is Extract<ChatBlock, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({ function: { name: b.name, arguments: b.input } }));
      out.push({ role: "assistant", content: text, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) });
    } else {
      const results = m.content.filter((b): b is Extract<ChatBlock, { type: "tool_result" }> => b.type === "tool_result");
      if (results.length > 0) {
        for (const r of results) out.push({ role: "tool", content: r.content });
      } else {
        const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
        out.push({ role: "user", content: text });
      }
    }
  }
  return out;
}

export class OllamaProvider implements DirectApiProvider {
  readonly id = "ollama" as const;
  readonly kind = "direct_api" as const;
  readonly requiresApiKey = false;

  listModels(): string[] {
    return KNOWN_MODELS["ollama"] ?? [];
  }

  price(): { inputPerMTok: number; outputPerMTok: number } | null {
    return null; // local inference — no monetary cost to attribute
  }

  async chat(req: ChatRequest, signal: AbortSignal): Promise<ChatTurn> {
    const body = {
      model: req.model,
      stream: false,
      messages: toOllamaMessages(req.system, req.messages),
      ...(req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              type: "function",
              function: { name: t.name, description: t.description, parameters: t.inputSchema },
            })),
          }
        : {}),
    };
    const res = await fetch(`${config.ollamaHost}/api/chat`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Ollama ${res.status}: ${detail.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      message?: OllamaMessage;
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return parseOllamaMessage(data);
  }

  async discoverModels(): Promise<string[]> {
    const res = await fetch(`${config.ollamaHost}/api/tags`);
    if (!res.ok) throw new Error(`Ollama tags ${res.status}`);
    const data = (await res.json()) as { models?: { name?: string }[] };
    const names = (data.models ?? []).map((m) => m.name).filter((n): n is string => Boolean(n));
    return names.length > 0 ? names : this.listModels();
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const res = await fetch(`${config.ollamaHost}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      return {
        id: this.id,
        ok: res.ok,
        version: null,
        authenticated: null,
        detail: res.ok ? `reachable at ${config.ollamaHost}` : `unreachable (${res.status})`,
      };
    } catch {
      return {
        id: this.id,
        ok: false,
        version: null,
        authenticated: null,
        detail: `not running at ${config.ollamaHost}`,
      };
    }
  }
}

/** Parse an Ollama chat response into a normalized ChatTurn. Exported for tests. */
export function parseOllamaMessage(data: {
  message?: OllamaMessage;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}): ChatTurn {
  const message = data.message ?? { role: "assistant" };
  const content: ChatBlock[] = [];
  const toolCalls: ChatTurn["toolCalls"] = [];
  if (typeof message.content === "string" && message.content.length > 0) {
    content.push({ type: "text", text: message.content });
  }
  (message.tool_calls ?? []).forEach((tc, i) => {
    const name = tc.function?.name;
    if (!name) return;
    // Ollama gives no id — synthesize a stable one so the loop can pair results.
    const call = { id: `ollama_${i}_${name}`, name, input: (tc.function?.arguments ?? {}) as Record<string, unknown> };
    content.push({ type: "tool_use", ...call });
    toolCalls.push(call);
  });
  return {
    content,
    toolCalls,
    text: typeof message.content === "string" ? message.content : "",
    stopReason: toolCalls.length > 0 ? "tool_use" : data.done_reason === "length" ? "max_tokens" : "end_turn",
    usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 },
  };
}
