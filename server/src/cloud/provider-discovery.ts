import type { CommandFailureReason, ProviderDiscoverModelsPayload } from "@sparstrow/shared";
import { getProvider } from "../providers/index.js";
import { logger } from "../logger.js";
import { cloudFetch } from "./client.js";

/**
 * T-CS3-03 (Band 26, CS chat session & conversation UX). Handles a
 * `providers.discover_models` command: run the provider's own live
 * discovery (T-CS3-01), then POST the result to
 * `/api/daemon/providers/discover-models` — the same `/api/daemon/*`,
 * service-role, bearer-token pattern every other daemon-to-cloud write
 * uses (see `apps/web/src/lib/daemon/auth.ts`'s header). This machine
 * never calls `record_provider_models` directly; it has no `auth.uid()`
 * under this token scheme, only a bearer token that route validates.
 */
export async function discoverProviderModels(
  payload: ProviderDiscoverModelsPayload,
): Promise<{ ok: true } | { ok: false; failure: { reason: CommandFailureReason; error: string } }> {
  const { provider: providerId } = payload;
  let provider;
  try {
    provider = getProvider(providerId as never);
  } catch {
    return { ok: false, failure: { reason: "spawn_failed", error: `Unknown provider: ${providerId}` } };
  }

  if (provider.kind !== "cli" || !provider.discoverModels) {
    // Not this machine's fault, and not really a failure — the control plane
    // shouldn't have dispatched this provider here, but there's nothing to
    // retry. Ack done rather than failed, same framing memory.sync's
    // doorbell uses for "nothing to do".
    logger.info({ providerId }, "providers.discover_models: no live discovery for this provider, skipping");
    return { ok: true };
  }

  const result = await provider.discoverModels();

  try {
    await cloudFetch("/providers/discover-models", {
      method: "POST",
      body: { provider: providerId, models: result.models, live: result.live, detail: result.detail },
      retries: 2,
      timeoutMs: 15_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, providerId }, "providers.discover_models: could not report result to the control plane");
    return { ok: false, failure: { reason: "spawn_failed", error: message } };
  }

  return { ok: true };
}
