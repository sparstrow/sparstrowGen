import type { ProviderId } from "@sparstrow/shared";
import { getProvider } from "../providers/index.js";
import type { CliProvider } from "../providers/types.js";
import type { AgentBackend } from "./backend.js";
import { createCliBackend } from "./cli-backend.js";
import { createOllamaBackend } from "./ollama-backend.js";

const backendCache = new Map<ProviderId, AgentBackend>();

/**
 * Universal backend lookup, matching Multica's daemon agent registry.
 */
export function getAgentBackend(providerId: ProviderId): AgentBackend {
  let backend = backendCache.get(providerId);
  if (backend) return backend;

  switch (providerId) {
    case "claude-code": {
      const cli = getProvider("claude-code") as CliProvider;
      backend = createCliBackend(cli, "sonnet");
      break;
    }
    case "antigravity": {
      const cli = getProvider("antigravity") as CliProvider;
      backend = createCliBackend(cli, "Gemini 2.5 Flash");
      break;
    }
    case "ollama": {
      backend = createOllamaBackend();
      break;
    }
    default: {
      const p = getProvider(providerId);
      if (p.kind === "cli") {
        backend = createCliBackend(p as CliProvider, "default");
        break;
      }
      throw new Error(`Unsupported backend provider: ${providerId}`);
    }
  }

  backendCache.set(providerId, backend);
  return backend;
}
