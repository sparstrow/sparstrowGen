# T-CS5-02 — upload flow

| | |
|---|---|
| **Tag** | `[S]` — writes into T-CS5-01's bucket/table |
| **Serves** | foundational — unblocks CS6 |
| **Depends on** | T-CS5-01 |
| **Blocks** | T-CS5-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

## Objective

A generalized uploader (following `apps/web/src/lib/storage/image-uploader.ts`'s
shape) that uploads an arbitrary file to `chat-attachments` and creates its
`chat_message_attachments` row, ready for CS6 to call from the composer.

## Decisions already made

`image-uploader.ts` uploads then returns a public URL
(`getPublicUrl`) — this task's uploader must NOT do that (phase Trap); it
returns the storage path/key, and reads happen later through a signed URL
minted on demand (T-CS5-03), never a permanent URL stored anywhere.

## The shape of what was found

**The exact send-flow ordering the Traps section asks to confirm, found
before finalizing anything:** `postChatTurnAction` (`apps/web/src/app/chat/actions.ts`)
is the ONLY place a `chat_messages` row for what the user typed is created —
via `enqueue_chat_turn`, a `SECURITY DEFINER` RPC that inserts the turn and
the user message in one transaction (014's own header). There is no earlier
point where a real `chat_messages.id` exists for the message about to be
sent. This settles the Trap directly: the attachment-row-creation step
cannot be a separate, earlier action — it has to run **inside**
`postChatTurnAction`, after the RPC returns and `turnStateRow` resolves the
real `userMessage.id`. The upload itself (bytes to Storage) still happens
independently and earlier, whenever the file is selected in the composer
(CS6) — only the *row* referencing the message waits.

## Checklist

- [x] `createChatAttachmentUploader` in
      `apps/web/src/lib/storage/attachment-uploader.ts`, mirroring
      `createSupabaseImageUploader`'s shape but: (a) targets
      `CHAT_ATTACHMENT_BUCKET`, (b) validates against
      `checkChatAttachmentFile` client-side (courtesy check, not the
      security — same framing as `checkImageFile`'s own comment), (c)
      returns `{ storagePath, filename, mimeType, sizeBytes }`
      (`ChatAttachmentUpload`, new shared type), not a URL
- [x] `postChatTurnAction` extended (not a separate action — see "shape of
      what was found" above) to accept `input.attachments?:
      ChatAttachmentUpload[]` and insert the `chat_message_attachments`
      rows immediately after `enqueue_chat_turn` + `turnStateRow` resolve
      the real message id
- [x] Rejected upload (wrong type/too large) surfaces a specific, readable
      error before any network call, not after — `checkChatAttachmentFile`
      runs first in `.upload()`, live-verified (unit test) that
      `storage.upload` is never called on rejection
- [x] `apps/web` typecheck and tests green

## Traps

- **Returning a public URL here (copy-pasting `image-uploader.ts` too
  literally) recreates the exact leak the phase README's Trap names.** The
  return shape is deliberately different — `storagePath`/`filename`/
  `mimeType`/`sizeBytes`, never a URL. Unit-tested directly: `getPublicUrl`
  is never called, and the result has neither a `url` nor `publicUrl` key.
- **An attachment row must reference a real `chat_messages.id`** — resolved
  above: the row-creation step lives inside `postChatTurnAction`, after the
  real message exists, not in a separate pre-send action. Unit-tested that
  the inserted `message_id` is the RPC-created message's own id, not a
  placeholder generated before `enqueue_chat_turn` ran.
- **Found while implementing, not anticipated by the plan:** what happens
  when the message send itself succeeds but the attachment insert fails
  afterward? The turn and its message are already real and already
  dispatched by that point — failing the whole action would tell the owner
  their message wasn't sent when it was. Decided: the send is reported
  successful regardless (`console.error`-logged, not surfaced to the
  caller); CS6 owns deciding whether/how to surface a partial-attachment
  failure in the UI. Unit-tested: a forced attachment-insert failure still
  returns `{ ok: true }`.
- **How many attachments a message may carry is a spec-level open edge
  case** ("What happens when the owner attaches more than one file to a
  single message?", spec's own Edge Cases section) that this task does not
  answer at the UX level — only added `CHAT_ATTACHMENTS_MAX_PER_MESSAGE = 10`
  as a request-boundary sanity clamp (same kind `CHAT_MESSAGE_MAX_BYTES`
  already is for `content`), explicitly not a product decision about a
  realistic count. Left for CS6 to actually decide and, if needed, revise.

## Verification

- [x] **Live, real end-to-end pass** (not simulated): signed in as a real
      disposable account, bootstrapped a real workspace, created a real
      `chat_sessions` row, uploaded a real file to `chat-attachments` at
      the expected `<workspace_id>/<session_id>/<uuid>.<ext>` path, called
      `enqueue_chat_turn` for real, found the REAL user message id it
      created, inserted the `chat_message_attachments` row against that
      real id, read it back through RLS, and downloaded the object back —
      byte-for-byte match confirmed. This exercises the exact sequence
      `postChatTurnAction` performs, against real infrastructure, not a
      re-run of the action function itself (which needs a Next.js request
      context `actionContext()` depends on that a standalone script can't
      provide) — the action's own sequencing/ordering logic is what the
      unit tests below cover.
- [x] Unit tests (`actions.test.ts`): attachment row created with the real
      message id; nothing touches `chat_message_attachments` when no
      attachments were sent; a failed attachment insert still reports the
      send as successful
- [x] Unit tests (`attachment-uploader.test.ts`): oversized/disallowed-type
      files rejected before `storage.upload` is ever called; a valid
      upload returns the exact expected shape with no `url`/`publicUrl`
      key; a storage error propagates as a thrown `Error`
- [x] Confirmed no public URL is ever produced or stored anywhere in this
      flow — by test, not by reading the code and assuming
- [x] Disposable account/workspace/session/message/attachment row all
      cleaned up afterward, cascade-verified as empty (a stray orphaned
      storage object was left in place — same accepted tradeoff
      T-CS5-01's own migration documents for this exact class of leftover)

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, the Trap's own question answered by reading the shipped
code first.** `postChatTurnAction` is the only place a real
`chat_messages.id` for the outgoing message comes into existence
(`enqueue_chat_turn`'s `SECURITY DEFINER` RPC creates it atomically with the
turn) — so the attachment-row-creation step had to become an extension of
that action, not a separate one, confirming the Trap's own suspicion before
any code was written rather than after CS6 hit the seam.

Verified with a genuine live, unmocked pass against real Supabase
infrastructure: a real account, workspace, session, uploaded file, dispatched
turn, and attachment row, read back and downloaded byte-for-byte — plus unit
tests for the action's own sequencing (real message id, no-op when nothing
attached, send still succeeds if the attachment insert fails) and the
uploader's own validation/shape guarantees (reject-before-network, no public
URL ever produced). `pnpm --filter web typecheck`/`test` green (462 tests,
+7 new). One open item deliberately left for CS6: the spec's own "more than
one attachment" edge case has only a sanity-clamp answer here
(`CHAT_ATTACHMENTS_MAX_PER_MESSAGE = 10`), not a UX decision.

**Correction, 2026-08-28, by `T-CS5-03`:** this task's own "attachment-row
insert as an extension of `postChatTurnAction`, after `enqueue_chat_turn`
returns" design had a real bug T-CS5-03 found and fixed: `enqueue_chat_turn`
calls `assign_or_park_chat_turn` **synchronously, inside its own
transaction**, so for the common case (a runtime already online) dispatch
happens and the payload is built BEFORE this task's separate, later insert
ever ran — the attachments array would have been empty every time. Per
`026_chat_attachments_dispatch.sql`, the insert now happens INSIDE
`enqueue_chat_turn` itself, atomically, before it dispatches;
`postChatTurnAction`'s separate insert step (this task's own code, above)
was removed. This task's live-verification pass above still stands as proof
the underlying upload/table/RLS mechanics work — what it did not catch was
that the CALLING ORDER it verified doesn't hold once a runtime is already
online, since that pass had no daemon paired to dispatch through.
