# T-CS5-02 — upload flow

| | |
|---|---|
| **Tag** | `[S]` — writes into T-CS5-01's bucket/table |
| **Serves** | foundational — unblocks CS6 |
| **Depends on** | T-CS5-01 |
| **Blocks** | T-CS5-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

A generalized uploader (following `apps/web/src/lib/storage/image-uploader.ts`'s
shape) that uploads an arbitrary file to `chat-attachments` and creates its
`chat_message_attachments` row, ready for CS6 to call from the composer.

## Decisions already made

`image-uploader.ts` uploads then returns a public URL
(`getPublicUrl`) — this task's uploader must NOT do that (phase Trap); it
returns the storage path/key, and reads happen later through a signed URL
minted on demand (T-CS5-03), never a permanent URL stored anywhere.

## Checklist

- [ ] `createChatAttachmentUploader` (or similar), mirroring
      `createSupabaseImageUploader`'s shape but: (a) targets
      `CHAT_ATTACHMENT_BUCKET`, (b) validates against
      `CHAT_ATTACHMENT_ALLOWED_TYPES`/`CHAT_ATTACHMENT_MAX_BYTES` client-side
      (courtesy check, not the security — same framing as the existing file's
      own comment), (c) returns `{ storagePath, filename, mimeType,
      sizeBytes }`, not a URL
- [ ] A server action (or the message-send action, extended) that, given an
      uploaded object's path plus a `messageId`, inserts the
      `chat_message_attachments` row
- [ ] Rejected upload (wrong type/too large) surfaces a specific, readable
      error before any network call, not after
- [ ] `apps/web` typecheck and tests green

## Traps

- **Returning a public URL here (copy-pasting `image-uploader.ts` too
  literally) recreates the exact leak the phase README's Trap names.** The
  return shape is deliberately different from that file's — don't unify
  them just because they look similar.
- **An attachment row must reference a real `chat_messages.id`** — if the
  UI (CS6) needs to upload before the message exists yet (e.g. attaching
  before pressing send), this task's row-creation step must be callable
  AFTER the message is actually inserted, not before. Confirm the actual
  send-flow ordering CS6 will need before finalizing this action's
  signature — a mismatch here is exactly the kind of seam CS6 would
  otherwise discover the hard way.

## Verification

- [ ] Upload a valid file; confirm the object lands at the expected
      `<workspace_id>/<session_id>/…` path and a `chat_message_attachments`
      row is created
- [ ] Upload an oversized or disallowed-type file; confirm it's rejected
      client-side with a specific message, no network call made
- [ ] Confirm no public URL is ever produced or stored anywhere in this flow

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
