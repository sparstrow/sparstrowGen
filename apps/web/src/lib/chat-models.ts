import { KNOWN_MODELS, type ProviderId } from "@sparstrow/shared";

/**
 * Which models a provider offers right now.
 *
 * `antigravity` reads its list from `provider_model_cache` (T-CS4-01) and is
 * therefore EMPTY until that cache has been fetched at least once; every
 * other provider has a static list compiled in.
 *
 * Structurally typed on `{ models }` rather than importing chat.tsx's
 * `AntigravityModelState`, so this stays testable without a React hook.
 */
export function modelsForProvider(
  provider: ProviderId,
  antigravity: { models: string[] },
): string[] {
  return provider === "antigravity" ? antigravity.models : (KNOWN_MODELS[provider] ?? []);
}

/**
 * The model to pin when the owner switches a session's (or a draft's)
 * provider.
 *
 * T-CS6-02 found this mattering. Before CS4, `antigravity`'s list was static
 * and always non-empty, so `modelsForProvider(...)[0]` always produced a
 * valid model. CS4 moved that list to a cache, which made the empty case
 * reachable for the first time — and the two call sites fell back to
 * `"sonnet"` and `""` respectively:
 *
 *   - `"sonnet"` is a **claude-code** model. Written onto an antigravity
 *     session it dispatches `agy --model sonnet`, which fails. Reproduced
 *     live: a session persisted `provider=antigravity, model=sonnet` after a
 *     switch made while the cache was still cold.
 *   - `""` is not nullish, so `createChatSession`'s own `?? "sonnet"` does
 *     not catch it; the session is created with an empty model and
 *     dispatches `--model ""`.
 *
 * Falling back to the provider's OWN compiled-in seed keeps the pair valid
 * whatever the cache is doing. The literal remains only as a last resort for
 * a provider with no seed at all — which no configured provider is today.
 */
export function defaultModelForProvider(
  provider: ProviderId,
  antigravity: { models: string[] },
): string {
  return modelsForProvider(provider, antigravity)[0] ?? KNOWN_MODELS[provider]?.[0] ?? "sonnet";
}
