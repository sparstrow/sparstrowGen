# CS7 — Project chat model picker at creation

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-29-project-chat-model-picker.md`](../../plans/2026-08-29-project-chat-model-picker.md) |
| **Kind** | **serves US-PMC** — ends in something the owner can use |
| **Spec** | [`../../bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md`](../../bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md) |
| **Depends on** | Band 26 (CS1–CS6) |
| **Blocks** | nothing |
| **Status** | done (2026-08-29) |
| **Open questions** | none |

## The story this serves

> **US-PMC — Choosing Provider & Model when starting a Project chat**
>
> When starting a new conversation about a project, the owner can select their desired Provider (Claude, Antigravity) and Model (e.g. Sonnet, Haiku, Gemini, etc.) directly in the draft composer, and the new session and its initial turn use that chosen model.

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS7-01 — project chat model selection controls & payload](T-CS7-01-project-model-selection.md) | `[S]` | US-PMC | — | done (2026-08-29) |
| [T-CS7-02 — verification & bug closure](T-CS7-02-verification.md) | `[S]` | US-PMC | T-CS7-01 | done (2026-08-29) |

## Files

| Path | Change |
|---|---|
| `apps/web/src/app/chat/chat.tsx` | Render Provider/Model pickers for project drafts & forward `draftProvider`/`draftModel` in `ensureSessionId` |
| `apps/web/src/app/chat/actions.test.ts` | Unit test verifying project sessions with explicit provider/model persist correctly |
| `doc/bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md` | Mark resolved |
| `doc/bug/README.md` | Update index |
