# Project Chat Model Picker at Creation — 2026-08-29

| | |
|---|---|
| **Spec** | [`../bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md`](../bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md) |
| **Status** | Approved 2026-08-29 |
| **Trigger** | Fix `BUG-2026-08-28-project-chat-cannot-choose-model-at-creation`: allow choosing Provider and Model when creating a Project chat session on `/chat` |
| **Depends on** | Band 26 (CS1–CS6) |
| **Touches** | `apps/web/src/app/chat/chat.tsx`, `apps/web/src/app/chat/actions.test.ts`, `doc/bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md` |
| **Tasks** | [`../tasks/CS7/`](../tasks/CS7/) |
| **Open questions** | none |

## Summary

When drafting a new chat session scoped to a Project (`kind: "project"`), the composer in `apps/web/src/app/chat/chat.tsx` hides the Provider and Model pickers and drops `draftProvider`/`draftModel` during session creation, silently defaulting the session to `claude-code / sonnet`.

This plan updates the composer's draft context controls so that Provider (`GhostSelect`) and Model (`ModelPicker`) are displayed and interactive for `draftKind === "project"`, and forwarded to `createChatSessionAction`.

## Work breakdown

### Foundational
*None — backend service (`packages/core/src/chat/service.ts`), Server Action (`apps/web/src/app/chat/actions.ts`), schema (`@sparstrow/shared`), and database models already support custom provider/model for project chats.*

### Per story

| Story | Work | Delivers |
|---|---|---|
| US-PMC | Update `chat.tsx` draft controls & creation payload + unit tests in `actions.test.ts` | The user can pick any available Provider & Model when starting a Project chat |

## Decisions

### 1. Render Provider & Model alongside Project picker for `draftKind === "project"`
- **Choice**: Display `GhostSelect` (Provider) and `ModelPicker` (Model) for both `draftKind === "free"` and `draftKind === "project"`.
- **Rejected alternatives**:
  - *Keep project chats pinned to default model*: Rejected — defeats user choice, costs the first turn on an unwanted model, and is inconsistent with post-creation switching.
  - *Show pickers for `draftKind === "agent"`*: Rejected — agents define their own fixed provider and model in their agent config.

### 2. Forward `draftProvider` and `draftModel` in `ensureSessionId()`
- **Choice**: Forward `provider: draftProvider, model: draftModel` when `draftKind === "project"`.
- **Rejected alternatives**:
  - *Omit fields and rely on post-creation `updateChatSessionAction`*: Rejected — incurs an extra network round-trip and races the first turn dispatch.

## Verification

- `pnpm --filter web test` passes including new test in `actions.test.ts`.
- `pnpm typecheck` passes cleanly across the entire workspace.
- Live browser verification on `http://localhost:3000/chat`.
