# T-CS6-01 — drag-and-drop / upload UI

| | |
|---|---|
| **Tag** | `[S]` — sole implementation task in this phase |
| **Serves** | `US4` — "attach files and media to a chat message" |
| **Depends on** | CS5 (needs the upload flow and delivery pipeline) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## The scenario this satisfies

1. Drag a file onto the composer → shows attached to the draft, removable.
2. Send with an attachment → shows on the sent message, persists on reload.
3. Rejected type/size → told clearly why before the message sends.

## Objective

Composer UI: a drop zone plus an explicit upload button, an attachment chip
on the draft (removable), and the same chip rendered on a sent message
(read from `chat_message_attachments` via T-CS5-01's table).

## Decisions already made

None beyond the phase README — this is UI wiring against CS5's
already-decided uploader (T-CS5-02) and schema (T-CS5-01).

## Checklist

- [ ] Drop zone covering the composer's input area, plus a visible
      click-to-upload control (not drag-only — the spec requires both)
- [ ] On drop/select: client-side type/size check
      (`CHAT_ATTACHMENT_ALLOWED_TYPES`/`MAX_BYTES`) before any upload call;
      a rejected file shows a specific reason immediately
- [ ] A valid file uploads (T-CS5-02's uploader) and shows an attachment
      chip on the draft with a remove control; send is disabled only while
      the upload is genuinely in flight
- [ ] Sending with an attachment present creates the message, then the
      `chat_message_attachments` row (T-CS5-02's action) referencing it —
      confirm the exact ordering T-CS5-02 settled on
- [ ] Sent messages render their attachment chip, reading
      `chat_message_attachments` for that message
- [ ] Removing an attachment before sending discards the uploaded object
      (best-effort cleanup, matching `image-uploader.ts`'s own
      `remove()`'s "best-effort" framing) rather than leaving it orphaned
- [ ] Empty-text-plus-attachment sends are allowed (phase Trap)
- [ ] `apps/web` typecheck and tests green

## Traps

- **Confirm T-CS5-02's actual message-vs-attachment-row ordering before
  wiring this** — if the attachment must be uploaded before the message
  exists, or only after, get this task's send flow to match, not the other
  way around.
- **A drag-and-drop zone that also intercepts normal text selection/paste
  in the composer is a regression** — scope the drop handler to actual file
  drags, not all drag events, so selecting and copying message text still
  works.

## Verification

- [ ] Drag a valid file onto the composer; confirm it attaches, is
      removable, and sends correctly
- [ ] Use the click-to-upload control for the same
- [ ] Attach a rejected type/size; confirm the specific rejection message
      and that no upload call was made
- [ ] Send an attachment with no text; confirm it sends
- [ ] Reload after sending; confirm the attachment is still shown on the
      message
- [ ] Full acceptance-scenario + cross-story walk in
      [T-CS6-02](T-CS6-02-verification.md)

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
