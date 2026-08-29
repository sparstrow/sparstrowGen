# FB-2026-08-27-chat-missing-file-upload

**Status:** 🟢 routed
**Reported by:** owner
**Reported:** 2026-08-27
**Area:** Chat — composer (`/chat`, free chat)

## Raw feedback

> Our app's chat page does not have a feature to drag and drop files or
> upload files and media. Which we need it.

(Shared alongside a screenshot of the Chat page's empty-state composer —
"Start the conversation..." input with only kind/provider/model dropdowns and
a send button; no attach/upload affordance visible.)

## Context

The chat composer currently only accepts typed text — there's no button,
icon, or drag-and-drop zone in the input area for attaching a file or media
to a message.

Owner's expectation: be able to drag and drop a file onto the chat, or upload
one via a picker, as part of composing a message.

## Triage

Worth building. Routed into
[`doc/specs/2026-08-27-chat-session-and-conversation-ux.md`](../specs/2026-08-27-chat-session-and-conversation-ux.md)'s
US4.

## Resolution

Built — US4 of [the chat UX spec](../specs/2026-08-27-chat-session-and-conversation-ux.md),
shipped in band 26 (`CS5`/`CS6`, done 2026-08-28). The composer takes a file
via the paperclip picker or drag-and-drop, shows it as a removable chip before
sending, and refuses an oversized or unsupported file in the composer with the
reason, before it's ever sent. This closes the loop the owner's original
message asked for — the input half of "files and media" in chat. Its output
counterpart (an agent's own replies showing what it produced, not just
claiming to) is the separate, later ask captured in
[`FB-2026-08-28-chat-generated-media-not-shown-in-chat`](FB-2026-08-28-chat-generated-media-not-shown-in-chat.md),
built by band 27.

**Left as-is, not marked stale:** the flip to `✅ resolved` was missed when
CS6 landed — this entry sat at `🟡 triaged` for a day after the feature it
routed to had already shipped. Caught and closed here rather than left for
the next reader to notice.
