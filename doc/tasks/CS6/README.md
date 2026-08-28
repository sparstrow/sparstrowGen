# CS6 — Composer attachments, and the cross-story pass

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-27-chat-session-and-conversation-ux.md`](../../plans/2026-08-27-chat-session-and-conversation-ux.md) (CS6) |
| **Kind** | **serves US4** — ends in something the owner can use |
| **Spec** | [`../../specs/2026-08-27-chat-session-and-conversation-ux.md`](../../specs/2026-08-27-chat-session-and-conversation-ux.md) |
| **Depends on** | CS5 |
| **Blocks** | nothing — last phase in this plan |
| **Status** | not started |
| **Open questions** | none |

## The story this serves

> **US4 — Attach files and media to a chat message** (spec)
>
> The owner wants to give the agent a file or image as part of a message,
> either by dragging it onto the composer or using an upload control.

**Acceptance scenarios this phase must satisfy:**

1. Drag a file onto the composer → it shows attached to the draft, removable.
2. Send with an attachment → it shows on the sent message, persists across
   reopening the session.
3. Attach a rejected type/size → told clearly why before the message sends.

**Independent test:** Drag a file onto the composer, confirm it shows
attached, send, reopen the session, confirm it's still there and the
agent's reply reflects it.

## The four states

| Surface | Populated | Empty | Loading | Error |
|---|---|---|---|---|
| Composer attachment area | Attached file shown with a remove control | No attachment: composer looks exactly as before this phase | Upload in progress: visible progress, send disabled until it resolves or is removed | Rejected type/size, or a failed upload: specific reason shown, message not sent |
| Sent message's attachment | Shown alongside the message text, persists on reload | n/a | n/a | n/a |

## Tasks

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-CS6-01 — drag-and-drop / upload UI](T-CS6-01-composer-ui.md) | `[S]` | US4 | CS5 | not started |
| [T-CS6-02 — verification, and CS1–CS5 walked together](T-CS6-02-verification.md) | `[S]` | US4 | T-CS6-01 | not started |

## Objective

The composer UI that produces an attachment CS5's pipeline can deliver:
drag-and-drop plus a click-to-upload control, a visible attached-file chip
on the draft, removable before sending, and shown on the sent message
afterward.

## The shape of what was found

The composer (`apps/web/src/app/chat/chat.tsx`) has no attach affordance of
any kind today, confirmed via
[`FB-2026-08-27-chat-missing-file-upload`](../../feedback/FB-2026-08-27-chat-missing-file-upload.md)
— just kind/provider/model dropdowns and a send button. This phase adds the
UI; CS5 already built everything underneath it.

## Definition of done

- US4 acceptance scenarios 1–3, walked end to end, with a reply that
  genuinely reflects the attached file's content (not just a filename
  mention) — the bar CS5's own verification also names.
- All four states above.
- As the **last** phase in this plan, its verification task also re-walks
  CS1–CS3's own acceptance scenarios in the same session, since `chat.tsx`
  is a file every phase in this plan touches and a late phase is where a
  seam between them would first show up.
- `pnpm typecheck` and `pnpm test` stay green.

**Not in this phase:** anything CS5 already decided (storage, delivery,
scoped tool grants) — this phase only consumes that pipeline.

---

## Decisions already made

None new — this phase is UI wiring against CS5's already-decided pipeline
and T-CS5-02's already-decided uploader shape.

## Files

| Path | Change |
|---|---|
| `apps/web/src/app/chat/chat.tsx` | edit: drag-and-drop zone, upload button, attachment chip on draft and on sent messages |

## Traps

- **Don't let the attachment chip block the send button while nothing is
  actually uploading** — only disable send during a genuine in-flight
  upload, not just because an attachment is present.
- **A message with an attachment but empty text must still be sendable** —
  the spec doesn't require accompanying text, and `chat_messages.content`
  being `NOT NULL` means an empty-text-plus-attachment send needs an
  explicit empty-string content, not a validation error blocking it.

## Verification

Full procedure in [T-CS6-02 — verification](T-CS6-02-verification.md).
