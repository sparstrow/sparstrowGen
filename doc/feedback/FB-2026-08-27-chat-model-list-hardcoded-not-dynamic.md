# FB-2026-08-27-chat-model-list-hardcoded-not-dynamic

**Status:** 🔴 new
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Chat — model picker (provider/model dropdown in the chat composer)

## Raw feedback

> another feedback to capture is that the models on the ai provider like
> claude and antigravity are fixed like gemini flash 3.5. But the actulal
> models are in the ai provider are keep on upgrading to different versions.
> So instead of fixed version, I want the program to reach out the provider,
> and check what models are avilble dynamically. I have attached a sample
> screenshot from antigravity where the models are upgraded, but our app
> didnt catch up and still using the old models which might even deprecate
> infuture but still we will be having it in our app

(Shared alongside two screenshots: (1) our app's Chat page with the model
dropdown open, provider "antigravity" selected, listing a fixed set — Gemini
3.1 Pro (High), Gemini 3.1 Pro (Low), Gemini 3.5 Flash (High/Medium/Low),
Claude Opus 4.6 (Thinking), Claude Sonnet 4.6 (Thinking), GPT-OSS 120B
(Medium); (2) Antigravity's own model dropdown, showing a different/newer
list — Gemini 3.7 Flash (Medium), Gemini 3.6 Flash (Medium, tagged "Fast"),
Gemini 3.5 Flash (Medium, tagged "Fast"), Gemini 3.1 Pro (High, currently
selected), Claude Sonnet 4.6 (Thinking), Claude Opus 4.6 (Thinking), GPT-OSS
120B (Medium).)

## Context

Comparing the two screenshots side by side: our app's model list for the
`antigravity` provider is missing Gemini 3.7 Flash and 3.6 Flash entirely —
models Antigravity's own picker already offers — while still listing
versions Antigravity's UI doesn't call out the same way. The model list in
our app appears to be a fixed/hardcoded set rather than fetched from the
provider at runtime, so it drifts out of sync as providers ship new model
versions or deprecate old ones.

Owner's expectation: the app should query each configured AI provider
(Claude, Antigravity, etc.) for its currently available models dynamically,
rather than shipping a fixed list that goes stale — otherwise the app keeps
offering models the provider may have already deprecated, and won't offer
new ones until someone manually updates the hardcoded list.

## Triage

<!-- Not triaged yet. -->

## Resolution

<!-- Not resolved yet. -->
