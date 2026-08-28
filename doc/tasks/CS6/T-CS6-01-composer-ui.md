# T-CS6-01 — drag-and-drop / upload UI

| | |
|---|---|
| **Tag** | `[S]` — sole implementation task in this phase |
| **Serves** | `US4` — "attach files and media to a chat message" |
| **Depends on** | CS5 (needs the upload flow and delivery pipeline) |
| **Blocks** | — |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done |

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

- [x] Drop zone covering the composer's input area, plus a visible
      click-to-upload control (not drag-only — the spec requires both)
- [x] On drop/select: client-side type/size check
      (`CHAT_ATTACHMENT_ALLOWED_TYPES`/`MAX_BYTES`) before any upload call;
      a rejected file shows a specific reason immediately
- [x] A valid file uploads (T-CS5-02's uploader) and shows an attachment
      chip on the draft with a remove control; send is disabled only while
      the upload is genuinely in flight
- [x] Sending with an attachment present creates the message, then the
      `chat_message_attachments` row (T-CS5-02's action) referencing it —
      confirm the exact ordering T-CS5-02 settled on
- [x] Sent messages render their attachment chip, reading
      `chat_message_attachments` for that message
- [x] Removing an attachment before sending discards the uploaded object
      (best-effort cleanup, matching `image-uploader.ts`'s own
      `remove()`'s "best-effort" framing) rather than leaving it orphaned
- [x] Empty-text-plus-attachment sends are allowed (phase Trap)
- [x] `apps/web` typecheck and tests green

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

- [x] Drag a valid file onto the composer; confirm it attaches, is
      removable, and sends correctly
- [x] Use the click-to-upload control for the same
- [x] Attach a rejected type/size; confirm the specific rejection message
      and that no upload call was made
- [x] Send an attachment with no text; confirm it sends
- [x] Reload after sending; confirm the attachment is still shown on the
      message
- [ ] Full acceptance-scenario + cross-story walk in
      [T-CS6-02](T-CS6-02-verification.md)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [x] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [x] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

Composer now carries the whole attachment lifecycle: a scoped drop zone
(`isFileDrag` gates on `dataTransfer.types.includes("Files")` so text
selection/drag inside the textarea is untouched), a "Attach a file" button
wired to the same hidden `<input type="file">`, one pending attachment at a
time with a removable chip, and a matching read-side chip on sent messages
that mints a signed URL on click (via the existing T-CS5-03 sign route).

**Ordering correction found while wiring the send flow**: `postChatTurnAction`
originally inserted the `chat_message_attachments` row *after*
`enqueue_chat_turn` returned, but `enqueue_chat_turn` dispatches synchronously
inside its own transaction (T-CS5-03's finding) — so for the common
runtime-already-online case the attachment row didn't exist yet when the
daemon read the payload. Fixed in T-CS5-03/04 by moving the insert inside
`enqueue_chat_turn` itself (migration `026_chat_attachments_dispatch.sql`);
this task's send flow was built against that corrected ordering, not the
original one the Traps section warned about.

Read side: reads (`handlers/chat.ts`) and writes (`app/chat/actions.ts`) each
build their own `turnStateRow` per T-WA-07's established split, but both now
call the same small, pure `attachmentsByMessageId()` helper
(`apps/web/src/lib/chat-attachments.ts`) — a shared data-fetch, not a shared
shape-builder, so it doesn't cross that boundary.

`chatMessageSchema.attachments` widened `ChatMessage` everywhere it's
constructed; `chatTurnRequestSchema.content`'s `.min(1)` was dropped (the
byte-ceiling refine stays) since content can now be empty when an attachment
carries the message — `postChatTurnAction`'s own validation
(`!content.trim() && !attachments?.length`) is what actually blocks a truly
empty send.

**Live-verified** end-to-end against the T-CS6-01 worktree's own dev server
(port 3030) using a disposable `@sparstrow.test` account signed in via
magic-link, driven with `agent-browser` (not the Claude Browser pane, per the
documented `visibilityState` bug):

- Click-to-upload: file uploads, chip renders with filename + size, Send
  enables with empty text.
- Drag-and-drop: a synthetic `DragEvent`/`DataTransfer` drop (CDP has no
  native OS file-drag simulation) exercised the real `onDrop` handler — not a
  bypass, since `onDropFile` is the identical `handleFileSelected` the
  click path calls — and produced the same pending chip.
- Rejected file (`.zip`): specific message ("Only images, PDF, plain text,
  Markdown, CSV, or JSON files are accepted.") shown immediately; confirmed
  via `read_network_requests` that no storage upload call fired.
- Empty-text send: message posted with only the attachment chip, no stray
  empty text bubble (the user-message branch skips rendering content when
  falsy).
- Text + attachment together: both render, stacked, right-aligned.
- Attachment click: mints a real Supabase signed URL and opens it in a new
  tab.
- Reload: attachment chip persists on the sent message (proves
  `attachmentsByMessageId` wiring on the read path).
- Removing a pending attachment: chip disappears, Send re-disables.

One environment-only observation, not a defect: once a turn is sent to a
workspace with no paired machine, it parks in `waiting` and `isTurnBusy`
correctly keeps the whole composer disabled (pre-existing gate, unrelated to
this task) — verification of the second scenario required starting a fresh
draft conversation rather than reusing the first one.

Housekeeping not completed: the two disposable `uipass-cs6-*@sparstrow.test`
accounts created for this pass were not cleaned up — the documented
runbook cleanup query (`DATABASE_URL` + raw SQL delete) was blocked by this
environment's own auto-mode action classifier as a risky action, and working
around a safety classifier wasn't appropriate here. They're accounted for
under the runbook's existing "disposable but not free" note; a future pass
(or the owner, via the SQL in `doc/runbooks/agent-browser-session.md`) can
sweep them along with any others that accumulate.

`pnpm --filter @sparstrow/shared typecheck/test`, `pnpm --filter
@sparstrow/core typecheck`, and `pnpm --filter web typecheck/test` all green
(320 / — / 465 tests respectively) in this worktree.
