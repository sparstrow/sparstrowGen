import type { ProviderId } from "@sparstrow/shared";
import type { ModelProvider } from "./types.js";
import { ClaudeCodeProvider } from "./claude-code.js";
import { GeminiCliProvider } from "./gemini-cli.js";

const registry = new Map<ProviderId, ModelProvider>();
registry.set("claude-code", new ClaudeCodeProvider());
registry.set("gemini-cli", new GeminiCliProvider());

export function getProvider(id: ProviderId): ModelProvider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`unknown or unavailable provider: ${id}`);
  return provider;
}

export function listProviders(): ModelProvider[] {
  return [...registry.values()];
}

export function registerProvider(provider: ModelProvider): void {
  registry.set(provider.id, provider);
}
