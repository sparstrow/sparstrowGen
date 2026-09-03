# FB-2026-08-27-chat-no-manual-rename-delete

**Status:** 🟡 triaged
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Chat — session list (`/chat`)

## Raw feedback

> Also one flaw is I cant rename and delete chat manually, there is option
> for me to do it too.

(Given in the same message as
[`FB-2026-08-27-chat-no-auto-rename-from-first-prompt`](FB-2026-08-27-chat-no-auto-rename-from-first-prompt.md),
as a second, separate complaint about chat session management — split into
its own file since it's a distinct capability from auto-naming.)

## Context

The chat session list (sidebar rows like "New conversation · Free chat ·
Aug 27, 08:12 PM") offers no visible way to rename a session or delete one —
no menu, no hover action, nothing in the rows shown across the shared
screenshots.

Owner's expectation: be able to manually rename and delete a chat session
from the session list, independent of whatever auto-naming behavior
[`FB-2026-08-27-chat-no-auto-rename-from-first-prompt`](FB-2026-08-27-chat-no-auto-rename-from-first-prompt.md)
ends up getting.

A quick look at [`apps/web/src/app/chat/chat.tsx`](../../apps/web/src/app/chat/chat.tsx)
confirms the gap: the only per-session control in the UI is an "Archive
session" icon button (calls `updateChatSessionAction`); there is no rename
control and no delete control anywhere in the component. The server action
(`updateChatSessionAction`, `apps/web/src/app/chat/actions.ts`) already
supports arbitrary field updates including title — per
[`doc/bug/BUG-2026-08-26-chat-session-updates-always-404.md`](../bug/BUG-2026-08-26-chat-session-updates-always-404.md)
its rename path was wired up and verified working — so a title update is not
missing at the data layer, only exposed nowhere in the interface. A delete
action was not found in `actions.ts` at all in this quick check, so that
piece may not exist yet even server-side; worth confirming at triage time.

## Triage

Worth building. Routed into
[`doc/specs/2026-08-27-chat-session-and-conversation-ux.md`](../specs/2026-08-27-chat-session-and-conversation-ux.md)'s
US1. Confirmed at triage: no delete action exists in `actions.ts` today, only
the rename-capable update and the existing archive path — matching this
file's note. The "is delete real or archive?" question this raised (also
flagged separately in [`I-13`](../Ideas.md)) was resolved with the owner in
the same conversation that produced the spec: a real, permanent delete,
behind an Archive/Delete/Cancel confirmation that warns the conversation is
gone for good.

## Resolution

<!-- Not resolved yet. -->
