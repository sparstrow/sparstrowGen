import type { ProviderHealth } from "@sparstrow/shared";
import { KNOWN_MODELS } from "@sparstrow/shared";
import { config } from "../config.js";
import { SECRET_ANTHROPIC_API_KEY, getSecret } from "../secrets/secret-store.js";
import type { ChatBlock, ChatRequest, ChatTurn, DirectApiProvider } from "./types.js";

/**
 * P8 (P8-Q1: Anthropic first) — the direct-API adapter for the Anthropic Messages
 * API. Deliberately raw `fetch`, not the SDK: it keeps the dependency surface
 * (and the trust boundary around agent-facing tool schemas) minimal, and the
 * Messages wire format is stable. The API key is read from the encrypted secret
 * store per call and never enters an agent's env (EC2). The class only knows how
 * to run ONE turn; the loop lives in orchestrator/tool-loop.ts.
 */

const ANTHROPIC_VERSION = "2023-06-01";

/** Per-1M-token pricing (input/output) for cost attribution. */
const PRICES: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** Map our neutral blocks to Anthropic content blocks. */
function toAnthropicContent(blocks: ChatBlock[]): AnthropicBlock[] {
  return blocks.map((b): AnthropicBlock => {
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
          ...(b.isError ? { is_error: true } : {}),
        };
    }
  });
}

export class AnthropicApiProvider implements DirectApiProvider {
  readonly id = "anthropic-api" as const;
  readonly kind = "direct_api" as const;
  readonly requiresApiKey = true;

  listModels(): string[] {
    return KNOWN_MODELS["anthropic-api"] ?? [];
  }

  price(model: string): { inputPerMTok: number; outputPerMTok: number } | null {
    return PRICES[model] ?? null;
  }

  private key(): string {
    const k = getSecret(SECRET_ANTHROPIC_API_KEY);
    if (!k) throw new Error("no Anthropic API key configured (Settings → Providers)");
    return k;
  }

  async chat(req: ChatRequest, signal: AbortSignal): Promise<ChatTurn> {
    const body = {
      model: req.model,
      max_tokens: req.maxTokens,
      ...(req.system ? { system: req.system } : {}),
      messages: req.messages.map((m) => ({
        role: m.role,
        content: toAnthropicContent(m.content),
      })),
      ...(req.tools.length > 0
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
            })),
          }
        : {}),
    };
    const res = await fetch(`${config.anthropicApiBase}/v1/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.key(),
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 400)}`);
    }
    const msg = (await res.json()) as {
      content?: AnthropicBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return parseAnthropicMessage(msg);
  }

  async discoverModels(): Promise<string[]> {
    const res = await fetch(`${config.anthropicApiBase}/v1/models?limit=100`, {
      headers: { "x-api-key": this.key(), "anthropic-version": ANTHROPIC_VERSION },
    });
    if (!res.ok) throw new Error(`Anthropic models ${res.status}`);
    const data = (await res.json()) as { data?: { id?: string }[] };
    const ids = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return ids.length > 0 ? ids : this.listModels();
  }

  async healthCheck(): Promise<ProviderHealth> {
    const present = Boolean(getSecret(SECRET_ANTHROPIC_API_KEY));
    return {
      id: this.id,
      ok: present,
      version: null,
      authenticated: present,
      detail: present ? "API key configured" : "no API key (Settings → Providers)",
    };
  }
}

/** Parse an Anthropic Messages response into a normalized ChatTurn. Exported for tests. */
export function parseAnthropicMessage(msg: {
  content?: AnthropicBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}): ChatTurn {
  const blocks = msg.content ?? [];
  const content: ChatBlock[] = [];
  const toolCalls: ChatTurn["toolCalls"] = [];
  const texts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") {
      content.push({ type: "text", text: b.text });
      texts.push(b.text);
    } else if (b.type === "tool_use" && b.id && b.name) {
      const call = { id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> };
      content.push({ type: "tool_use", ...call });
      toolCalls.push(call);
    }
    // thinking / other block types are dropped from the loop history.
  }
  const stopMap: Record<string, ChatTurn["stopReason"]> = {
    end_turn: "end_turn",
    tool_use: "tool_use",
    max_tokens: "max_tokens",
    refusal: "refusal",
  };
  return {
    content,
    toolCalls,
    text: texts.join("\n"),
    stopReason: stopMap[msg.stop_reason ?? ""] ?? "other",
    usage: {
      inputTokens: msg.usage?.input_tokens ?? 0,
      outputTokens: msg.usage?.output_tokens ?? 0,
    },
  };
}
