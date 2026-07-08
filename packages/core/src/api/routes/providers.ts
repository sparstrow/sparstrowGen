import type { FastifyInstance } from "fastify";
import {
  discoverModelsRequestSchema,
  executionModeForProvider,
  providerKeyUpdateSchema,
  type DiscoverModelsResult,
  type ProviderInfo,
} from "@sparstrow/shared";
import { HttpError } from "../../orchestrator/run-manager.js";
import { getProvider, listProviders } from "../../providers/index.js";
import type { DirectApiProvider } from "../../providers/types.js";
import {
  SECRET_ANTHROPIC_API_KEY,
  SECRET_GEMINI_API_KEY,
  getSecretMeta,
  hasSecret,
  setSecret,
  deleteSecret,
} from "../../secrets/secret-store.js";

/**
 * P8 — the provider surface: what runtimes exist, their key status, and live
 * model discovery. Direct-API keys live in the encrypted secret store (P7 EC2),
 * so these endpoints only ever expose presence + a masked hint, never the key.
 */

/** The secret-store key holding a provider's API key, or null when it needs none. */
function secretKeyForProvider(id: string): string | null {
  switch (id) {
    case "anthropic-api":
      return SECRET_ANTHROPIC_API_KEY;
    case "gemini-api":
      return SECRET_GEMINI_API_KEY;
    default:
      return null; // ollama + CLI providers need no stored key
  }
}

function requireDirectProvider(id: string): DirectApiProvider {
  let provider;
  try {
    provider = getProvider(id as never);
  } catch {
    throw new HttpError(404, `unknown provider: ${id}`);
  }
  if (provider.kind !== "direct_api") {
    throw new HttpError(400, `provider ${id} is not a direct-API provider`);
  }
  return provider;
}

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  /** All providers with mode, health, key status, and static model fallback. */
  app.get("/providers", async (): Promise<ProviderInfo[]> => {
    return Promise.all(
      listProviders().map(async (p): Promise<ProviderInfo> => {
        const health = await p.healthCheck();
        const secretKey = secretKeyForProvider(p.id);
        const requiresKey = p.kind === "direct_api" && p.requiresApiKey;
        return {
          id: p.id,
          mode: executionModeForProvider(p.id),
          ok: health.ok,
          version: health.version,
          detail: health.detail,
          requiresKey,
          keyPresent: secretKey ? hasSecret(secretKey) : false,
          models: p.listModels(),
        };
      }),
    );
  });

  /** Live model discovery for a direct-API provider; degrades to the static list. */
  app.post("/providers/discover-models", async (request): Promise<DiscoverModelsResult> => {
    const { provider: id } = discoverModelsRequestSchema.parse(request.body);
    const provider = requireDirectProvider(id);
    try {
      const models = await provider.discoverModels();
      return { provider: id, models, live: true, detail: null };
    } catch (err) {
      return {
        provider: id,
        models: provider.listModels(),
        live: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  });

  /** Presence + masked hint for a provider's API key (never the raw key). */
  app.get("/providers/:id/key", async (request) => {
    const { id } = request.params as { id: string };
    requireDirectProvider(id);
    const secretKey = secretKeyForProvider(id);
    if (!secretKey) return { present: false, hint: null, length: null };
    return getSecretMeta(secretKey);
  });

  app.put("/providers/:id/key", async (request) => {
    const { id } = request.params as { id: string };
    requireDirectProvider(id);
    const secretKey = secretKeyForProvider(id);
    if (!secretKey) throw new HttpError(400, `provider ${id} does not use an API key`);
    const { key } = providerKeyUpdateSchema.parse(request.body);
    setSecret(secretKey, key.trim());
    return getSecretMeta(secretKey);
  });

  app.delete("/providers/:id/key", async (request, reply) => {
    const { id } = request.params as { id: string };
    requireDirectProvider(id);
    const secretKey = secretKeyForProvider(id);
    if (secretKey) deleteSecret(secretKey);
    reply.code(204);
  });
}
