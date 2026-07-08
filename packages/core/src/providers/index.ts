import type { ProviderId } from "@sparstrow/shared";
import type { DirectApiProvider, ModelProvider } from "./types.js";
import { ClaudeCodeProvider } from "./claude-code.js";
import { GeminiCliProvider } from "./gemini-cli.js";
import { AntigravityCliProvider } from "./antigravity.js";
import { AnthropicApiProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";

const registry = new Map<ProviderId, ModelProvider>();
registry.set("claude-code", new ClaudeCodeProvider());
registry.set("gemini-cli", new GeminiCliProvider());
// P8.1: Antigravity CLI — Gemini CLI's successor.
registry.set("antigravity", new AntigravityCliProvider());
// P8 direct-API providers (execution mode derived from `kind`).
registry.set("anthropic-api", new AnthropicApiProvider());
registry.set("ollama", new OllamaProvider());

export function getProvider(id: ProviderId): ModelProvider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`unknown or unavailable provider: ${id}`);
  return provider;
}

export function listProviders(): ModelProvider[] {
  return [...registry.values()];
}

/** Only the direct-API providers (for the tool-loop, key vault, discover-models). */
export function listDirectApiProviders(): DirectApiProvider[] {
  return [...registry.values()].filter((p): p is DirectApiProvider => p.kind === "direct_api");
}

export function registerProvider(provider: ModelProvider): void {
  registry.set(provider.id, provider);
}
