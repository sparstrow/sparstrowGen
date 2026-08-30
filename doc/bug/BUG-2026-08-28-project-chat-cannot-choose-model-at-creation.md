# BUG-2026-08-28-project-chat-cannot-choose-model-at-creation

**Status:** 🟢 resolved
**Reported by:** agent — found while answering an owner question about whether
free-chatting with a raw model about a project was already built
**Reported:** 2026-08-28
**Resolved:** 2026-08-29 (CS7 / `T-CS7-01`)

## Symptom

Starting a chat about a project gives you no choice of provider or model. The
pickers that appear for a `free` chat are simply not rendered once you pick
"project", and the session is silently created as **claude-code / sonnet**.

Nothing tells the owner this choice was made for them. The first turn — the one
that sets the conversation's context — runs on a model they did not pick, and
Antigravity is unreachable for a project chat at the moment it is created.

## Reproduction

1. Open `/chat` with no session selected.
2. In the composer's context controls, set the kind to **Free** — a Provider
   and a Model picker appear.
3. Change the kind to **Project** and pick a project — **both pickers
   disappear.** There is no model control anywhere in the creation UI.
4. Send the first message.
5. Open the model controls on the now-created session: it is `claude-code` /
   `sonnet`, which was never offered as a choice.

## Investigation

Three layers, and only the top one is wrong.

- **The schema and service already support it.**
  [`service.ts:66`](../../packages/core/src/chat/service.ts:66) requires only a
  `projectId` for `kind: "project"` — an agent is *not* required — and takes
  `provider`/`model` straight from the input, falling back to
  `claude-code`/`sonnet` only when they are absent. `chatSessionCreateSchema`
  accepts both fields for every kind.
- **Post-creation switching already works for project chats.** `modelControls`
  in [`chat.tsx:549`](../../apps/web/src/app/chat/chat.tsx:549) renders for any
  active session that has a provider, project chats included, and its own
  tooltip says "switch anytime; the conversation continues".
- **The creation form is the only thing that drops it.**
  [`chat.tsx:624`](../../apps/web/src/app/chat/chat.tsx:624) renders the
  Provider/Model pickers under `draftKind === "free"` only, and
  [`chat.tsx:482`](../../apps/web/src/app/chat/chat.tsx:482) sends
  `provider`/`model` in the create call under the same condition:

  ```js
  ...(draftKind === "project" ? { projectId: draftProjectId } : {}),
  ...(draftKind === "agent" ? { agentId: draftAgentId } : {}),
  ...(draftKind === "free" ? { provider: draftProvider, model: draftModel } : {}),
  ```

  So the value is never collected and never sent. The service default then
  looks like a decision when it is only a fallback.

`kind: "agent"` dropping the pickers is correct and should stay — an agent
carries its own provider and model, and `service.ts` overrides them from the
agent row. Only the `project` branch is wrong.

No comment anywhere states that project chats are meant to be pinned to a
default model, and the post-creation picker being available for them is
evidence against that reading.

## Impact

Small but not cosmetic. The workaround — start on Sonnet, send a message, then
switch — costs the owner the first turn on a model they did not choose, which
is the turn that establishes context for the conversation.

It also makes the app read as inconsistent: the same two controls are present
for one kind of chat and silently absent for the next, with no explanation.

**Adjacent, and not the same thing:** the chat UX spec's US3 is about the model
*list* drifting from what a provider really offers. This is about the picker
being **absent entirely** for one kind of session. Fixing one does not fix the
other.

**Coordination:** band 26's CS4 is the model-picker task and touches exactly
this file and this control. This should be folded into that work rather than
fixed on a separate branch racing it — `chat.tsx` is already the chat surface
most contended by that band.

## Resolution

Fixed in `CS7` (`T-CS7-01`):
1. `apps/web/src/app/chat/chat.tsx`: `modelControls` updated to render `GhostSelect` (Provider) and `ModelPicker` (Model) when `draftKind === "free" || draftKind === "project"`.
2. `apps/web/src/app/chat/chat.tsx`: `ensureSessionId()` updated to forward `provider: draftProvider, model: draftModel` for `draftKind === "project"` creation.
3. Unit tests added to `apps/web/src/app/chat/actions.test.ts` verifying custom provider/model are persisted on project chat creation.
4. Verified end-to-end with live browser automated verification in Playwright against `localhost:3000/chat`.
