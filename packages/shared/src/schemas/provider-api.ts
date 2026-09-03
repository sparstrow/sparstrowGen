import { z } from "zod";
import { providerIdSchema, type ExecutionMode } from "./agent";

/**
 * P8 multi-provider surfaces shared by core (producer) and the UI (consumer).
 * Direct-API providers keep their key in the encrypted secret store (P7 EC2), so
 * nothing here ever carries a raw key — only presence + a masked hint.
 */

/** One provider's status row for the Settings + agent-form surfaces. */
export interface ProviderInfo {
  id: string;
  /** cli spawns a headless child; direct_api runs core's tool-loop. */
  mode: ExecutionMode;
  /** Health probe (CLI on PATH, or API reachable / key present). */
  ok: boolean;
  version: string | null;
  detail: string | null;
  /** direct_api only: does this provider need an API key? (ollama does not). */
  requiresKey: boolean;
  /** direct_api only: is a key stored? (masked hint via /providers/:id/key). */
  keyPresent: boolean;
  /** Static fallback model list; the live list comes from discover-models. */
  models: string[];
}

/** Body for setting a provider's API key. Empty string clears it. */
export const providerKeyUpdateSchema = z.object({ key: z.string() });
export type ProviderKeyUpdate = z.infer<typeof providerKeyUpdateSchema>;

/** Live model discovery per provider (cached core-side). */
export const discoverModelsRequestSchema = z.object({
  provider: providerIdSchema,
});
export type DiscoverModelsRequest = z.infer<typeof discoverModelsRequestSchema>;

export interface DiscoverModelsResult {
  provider: string;
  models: string[];
  /** True when the list is the live API/CLI result; false when it degraded to the static set. */
  live: boolean;
  detail: string | null;
}

/**
 * A workspace's cached model list for a provider (`provider_model_cache`,
 * T-CS3-02) — cloud-side and workspace-scoped, unlike `DiscoverModelsResult`
 * above which is the LOCAL host's own in-process discovery response
 * (`server/src/api/routes/providers.ts`, a different consumer).
 * `GET /providers/model-cache?provider=` (T-CS4-01) returns this or `null`
 * when no discovery has ever completed for that provider in this workspace.
 */
export interface ProviderModelCacheRow {
  provider: string;
  models: string[];
  live: boolean;
  detail: string | null;
  checkedAt: string;
}
