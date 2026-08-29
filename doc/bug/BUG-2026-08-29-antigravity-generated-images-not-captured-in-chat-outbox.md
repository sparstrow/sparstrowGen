# BUG-2026-08-29-antigravity-generated-images-not-captured-in-chat-outbox

**Status:** 🟢 resolved
**Reported by:** user / agent
**Reported:** 2026-08-29
**Resolved:** 2026-08-29

## Symptom

When asking an Antigravity model (e.g. Gemini 3.7 Flash) in chat to generate an image (e.g. "can you generate a image of a pen"), the model executes its native `generate_image` tool and creates the image. However:
1. The image is never displayed inline in the chat message or in the "Conversation Items" Preview panel.
2. The turn fails with `"The model failed · 1 attempt: the model returned no output"` if the model's text response was empty.
3. The Preview panel shows `"Nothing produced yet"`.

## Reproduction

1. Open `/chat` on a workspace paired with an Antigravity runtime.
2. Select Provider: `antigravity`, Model: `Gemini 3.7 Flash (High)`.
3. Send: `"can you generate a image of a pen"`.
4. Observe that the generated image does not appear in the chat reply or Preview pane.

## Investigation

1. When Antigravity (`agy`) runs, it executes its built-in `generate_image` tool, which outputs images directly into `~/.gemini/antigravity-cli/brain/<conversation-id>/<image_name>_<timestamp>.jpg` (or `~/.gemini/antigravity/brain/...`).
2. Sparstrowgen's chat turn file-production pipeline (`packages/core/src/cloud/chat-turn.ts` / Band 27) sweeps a per-turn temporary outbox directory (`outboxDir`).
3. Because `generate_image` writes to the Antigravity brain artifact folder rather than `outboxDir`, `outboxDir` is empty at sweep time (`kept: []`).
4. As a result, no files are uploaded to Supabase storage or bound to `chat_attachments`.
5. If `result.text` is empty and `uploaded` is empty, `chat-turn.ts` marks the turn as `failed` with `"the model returned no output"`.

## Resolution

1. Added `harvestAntigravityBrainFiles` in `packages/core/src/cloud/chat-turn.ts` to automatically scan and copy media/images produced in `~/.gemini/antigravity-cli/brain/<sessionId>` and `~/.gemini/antigravity/brain/<sessionId>` into `outboxDir` right before `sweepOutbox` runs.
2. In `packages/core/src/providers/antigravity.ts`, enhanced `extractResult` to provide a clean default fallback ("Here is the generated output.") when tools like `generate_image` are called without raw text responses, ensuring the turn completes with status `succeeded`.
3. Added unit tests in `antigravity.test.ts` and `chat-turn.test.ts`.
4. Verified live end-to-end via automated browser test: confirmed that the generated image is rendered inline in the chat reply, uploaded to storage, and displayed in the Preview panel under "MADE BY YOUR AGENT".

