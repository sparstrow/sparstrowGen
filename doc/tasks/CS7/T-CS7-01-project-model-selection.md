# T-CS7-01 — Project chat model selection controls & payload

| | |
|---|---|
| **Phase** | [`README.md`](README.md) (CS7) |
| **Kind** | feature / bugfix |
| **Tag** | `[S]` — single task in phase |
| **Serves** | US-PMC |
| **Depends on** | — |
| **Status** | done (2026-08-29) |

## Objective

Render the Provider and Model pickers in `apps/web/src/app/chat/chat.tsx` when `draftKind === "project"`, and forward `draftProvider` & `draftModel` in the `createChatSessionAction` call in `ensureSessionId()`.

## Definition of Done

- [x] When `draftKind === "project"`, both `GhostSelect` (Provider) and `ModelPicker` (Model) render next to the Project select.
- [x] Changing Provider or Model updates `draftProvider` and `draftModel`.
- [x] Submitting the message / creating the session passes `provider` and `model` in `createChatSessionAction`.
- [x] Unit tests in `apps/web/src/app/chat/actions.test.ts` assert that project sessions with explicit provider/model are created with those values.
