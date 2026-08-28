# T-CS5-01 — private bucket + attachments table + RLS

| | |
|---|---|
| **Tag** | `[S]` — T-CS5-02 writes into this bucket/table |
| **Serves** | foundational — unblocks CS6 |
| **Depends on** | — |
| **Blocks** | T-CS5-02, T-CS5-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

> Load the `supabase` and `supabase-postgres-best-practices` skills before
> writing this — a new private bucket with its own RLS, per `AGENTS.md`
> §3.12.

## Objective

The `chat-attachments` bucket (private) and the `chat_message_attachments`
table, both scoped so only members of the owning workspace can read or
write.

## Decisions already made

Phase decisions 1–2. Table shape:

```ts
export const chatMessageAttachments = pgTable(
  "chat_message_attachments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_chat_message_attachments_message").on(t.messageId)],
);
```

Bucket policy shape follows `013_storage_images.sql`'s prefix-scoped pattern,
but **read-restricted to workspace members** (unlike that bucket's
deliberate public read) — path prefix `<workspace_id>/<session_id>/…`, and
both the `SELECT` and `INSERT` storage policies check the caller is a member
of `<workspace_id>` via the same `private.current_workspace_ids()` helper
`001_rls.sql` already uses elsewhere.

## Checklist

- [ ] `chatMessageAttachments` table in `schema.ts`, per the shape above
- [ ] `CHAT_ATTACHMENT_BUCKET`, `CHAT_ATTACHMENT_ALLOWED_TYPES`,
      `CHAT_ATTACHMENT_MAX_BYTES` in `packages/shared/src/constants.ts`
      (starting values per phase decision 2: 2 MB, avatar's existing
      allowlist as a floor — widen only with a stated reason)
- [ ] New migration: bucket creation, its `storage.objects` RLS (workspace-
      member read AND write, path-prefix scoped), `chat_message_attachments`
      table DDL + RLS (added to the `001_rls.sql` workspace-scoped array, or
      its own policy — match whatever T-CS3-02 decided about new-table
      convention, for consistency across this same band)
- [ ] `get_advisors`/equivalent run clean
- [ ] `packages/shared` typecheck green

## Traps

- **Do not mark this bucket public, and do not add a `getPublicUrl` helper
  anywhere near it** — `013_storage_images.sql`'s header is the explicit
  warning this trap is naming.
- **The storage RLS policy must check workspace membership, not just that
  the caller is *a* member of *some* workspace** — copy the exact predicate
  shape `001_rls.sql`'s loop uses (`workspace_id in (select
  private.current_workspace_ids())`), applied to the path-embedded
  `workspace_id`, not assumed from context.

## Verification

- [ ] Upload a test object as a member of workspace A; confirm a session
      from workspace B cannot read or list it
- [ ] Confirm the bucket has no public URL that resolves (`getPublicUrl`'s
      equivalent should 403/404 for an unauthenticated request)
- [ ] `get_advisors` clean

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
