# T-CS7-02 — Verification & bug closure

| | |
|---|---|
| **Phase** | [`README.md`](README.md) (CS7) |
| **Kind** | verification |
| **Tag** | `[S]` — closes phase |
| **Serves** | US-PMC |
| **Depends on** | T-CS7-01 |
| **Status** | done (2026-08-29) |

## Objective

Verify all automated tests pass, verify the UI in the browser, and close the bug report.

## Definition of Done

- [x] `pnpm --filter web test` passes cleanly.
- [x] `pnpm typecheck` passes cleanly.
- [x] Live browser verification confirms that creating a project chat with custom provider/model sets the session to the chosen model.
- [x] `doc/bug/BUG-2026-08-28-project-chat-cannot-choose-model-at-creation.md` status is set to `🟢 resolved`.
- [x] `doc/bug/README.md` index updated.
