# BUG-2026-08-28-provider-switch-pins-invalid-model

**Status:** 🟢 resolved
**Reported by:** agent — found by `T-CS6-02`'s cross-story pass while
spot-checking CS4's picker
**Reported:** 2026-08-28

## Symptom

Switching a chat session's provider to `antigravity` **before that
workspace's model cache has been fetched** silently pins the session to
`sonnet` — a `claude-code` model that `agy` cannot run. The next turn
dispatches `agy --model sonnet` and fails.

Reproduced live and confirmed in the database:

```
provider = "antigravity",  model = "sonnet"
```

Nothing warns. The picker then lists the real Gemini models once the cache
warms seconds later, so the session looks fine while carrying an invalid
pair underneath.

## Reproduction

1. Sign in to a workspace whose `provider_model_cache` has no `antigravity`
   row yet (any fresh workspace).
2. Open a chat session and switch Provider to `antigravity` **immediately**,
   before the picker stops saying "no models available yet — checking…".
3. Read the row: `provider = antigravity`, `model = sonnet`.

## Investigation

`T-CS4-01` moved antigravity's model list from the compiled-in
`KNOWN_MODELS` to `provider_model_cache`, and changed the provider-switch
handler to read from it:

```js
model: modelsForProvider(provider, antigravity)[0] ?? "sonnet",
```

Before CS4, `modelsForProvider("antigravity", …)` returned the static list
and was **never empty**, so the `?? "sonnet"` branch was unreachable. CS4
made it reachable for the first time without changing it — a fallback that
was dead code became live, and it names a model belonging to a different
provider.

The draft-side (new conversation) switch had the same defect in a different
form:

```js
setDraftModel(modelsForProvider(provider, antigravity)[0] ?? "");
```

`""` is not nullish, so `createChatSession`'s own `model = input.model ??
"sonnet"` does **not** catch it — the session is created with an empty
model and dispatches `--model ""`.

## Impact

Moderate. Silent, produces a configuration that cannot run, and sits on the
most ordinary path there is for a new workspace: pick the other provider
before the page has finished warming. The failure surfaces later as a
provider error the owner has no way to connect to the switch they made.

## Resolution

Both call sites now use one helper, extracted to
`apps/web/src/lib/chat-models.ts` so the invariant can be tested without
mounting the chat component — the same reason `chat-turn-state.ts` lives
there:

```ts
export function defaultModelForProvider(provider, antigravity): string {
  return modelsForProvider(provider, antigravity)[0]
    ?? KNOWN_MODELS[provider]?.[0]
    ?? "sonnet";
}
```

Falling back to the provider's **own** compiled-in seed keeps the pair valid
whatever the cache is doing. The literal survives only as a last resort for a
provider with no seed at all, which no configured provider currently is.

`apps/web/src/lib/chat-models.test.ts` adds six tests, including the two that
pin the invariant directly: with a cold cache the chosen model is never
`"sonnet"` and is always a member of `KNOWN_MODELS.antigravity`, and no
state ever yields `""`.

**Verified live** after the fix: switching to `antigravity` set the model to
`Gemini 3.1 Pro (High)` in the UI and persisted that pair to the database;
switching to `claude-code` set `opus`. `apps/web` typecheck clean, 471 tests
passing (up from 465).
