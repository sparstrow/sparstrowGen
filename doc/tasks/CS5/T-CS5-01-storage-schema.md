# T-CS5-01 — private bucket + attachments table + RLS

| | |
|---|---|
| **Tag** | `[S]` — T-CS5-02 writes into this bucket/table |
| **Serves** | foundational — unblocks CS6 |
| **Depends on** | — |
| **Blocks** | T-CS5-02, T-CS5-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

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

- [x] `chatMessageAttachments` table in `schema.ts`, per the shape above
      (added a second index on `workspace_id` beyond the shape's own
      `message_id` index — every RLS policy filters on `workspace_id`,
      per `policies/README.md`'s own "Foreign-key indexes" note, and
      `workspace_id` isn't covered by any composite key here the way
      T-CS3-02's `provider_model_cache` had)
- [x] `CHAT_ATTACHMENT_BUCKET`, `CHAT_ATTACHMENT_ALLOWED_TYPES`,
      `CHAT_ATTACHMENT_MAX_BYTES` in `packages/shared/src/constants.ts` —
      2 MB ceiling kept as the floor (phase decision 2), but the MIME
      allowlist deliberately **widened** beyond the avatar precedent (a
      stated reason, not a silent assumption — see the constant's own
      comment): the entire point of this feature is a file a CLI agent's
      `Read` tool can use, and an image-only allowlist would make it
      useless for that. Added `text/plain`, `text/markdown`, `text/csv`,
      `application/json`, `application/pdf` alongside the three image
      types.
- [x] New migration `025_chat_attachments_storage.sql`: bucket creation,
      its `storage.objects` RLS (workspace-member SELECT and INSERT,
      path-prefix scoped — no UPDATE/DELETE, see Traps below),
      `chat_message_attachments` table RLS as its **own** `for all` policy
      (matching T-CS3-02's "own migration file" convention for a new table
      in this band, but the **blanket** `for all` shape from 001, not
      T-CS3-02's asymmetric SELECT-only one — correcting this checklist's
      own "match T-CS3-02" framing: this table doesn't share
      `provider_model_cache`'s reason to narrow, see the migration's own
      header comment)
- [x] `get_advisors` run clean — no new item introduced
- [x] `packages/shared` typecheck green

## Traps

- **Do not mark this bucket public, and do not add a `getPublicUrl` helper
  anywhere near it** — `013_storage_images.sql`'s header is the explicit
  warning this trap is naming. Confirmed live: `getPublicUrl`'s resulting
  URL returns 400 when fetched, not the 200 a public bucket would give.
- **The storage RLS policy must check workspace membership, not just that
  the caller is *a* member of *some* workspace** — copied the exact
  predicate shape `001_rls.sql`'s loop uses (`workspace_id in (select
  private.current_workspace_ids())`), applied to the path-embedded first
  folder segment. Confirmed live with two real disposable accounts in two
  different workspaces, not inferred from reading the policy text.
- **Found while writing this, not in the plan:** `chat_messages` was
  narrowed out of 001's blanket array by `014_chat_turn_dispatch.sql`
  (SELECT + role='user'-only INSERT, no update/delete) to stop a workspace
  member forging an assistant reply via PostgREST. `chat_message_attachments`
  has no equivalent forgeable field, so it correctly stays on the blanket
  `for all` shape — but this meant double-checking 014's reasoning applied
  before copying its narrower pattern by reflex, which the original
  checklist's "match T-CS3-02" note didn't anticipate either (that table's
  narrowing had a different cause: writes going through a
  `SECURITY DEFINER` function, not present here).
- **No UPDATE/DELETE storage policy, deliberately, not an oversight**: an
  attachment's bytes are immutable once uploaded (T-CS5-02's uploader
  always writes a fresh uuid-named object), and delete is out of scope for
  this phase. An orphaned object left behind by a deleted message (no FK
  from `storage.objects` to any table) is the same accepted tradeoff
  `image-uploader.ts`'s own "best-effort... a wasted couple of megabytes"
  comment already makes for avatars/logos — confirmed directly: `storage.objects`
  refuses direct SQL `DELETE` (`storage.protect_delete()`), so even
  cleaning up this task's own test object required the Storage API, not
  raw SQL; a small leftover test object was left in place rather than
  building a workaround for a one-off cleanup this phase doesn't need.

## Verification

- [x] **Live, real, two-account test** (not simulated): two disposable
      `%@sparstrow.test` accounts, each bootstrapped into its own real
      workspace via `bootstrap_workspace()`. As workspace A's member:
      uploaded to `<A>/<fake-session>/test.txt` (succeeded), read it back
      (succeeded). As workspace B's member: attempted to read A's object
      (denied — "Object not found", RLS hiding it exactly as intended, not
      a distinguishable 403) and attempted to write into A's own prefix
      (denied — explicit "new row violates row-level security policy").
      Both accounts and their workspaces cleaned up afterward via the
      documented SQL, re-verified as deleted.
- [x] `getPublicUrl`'s resulting URL fetched directly: **400**, not 200 —
      confirms the bucket is genuinely private, not just absent from the
      UI's own linking code.
- [x] `get_advisors` (security): no new item — verified against the live
      project immediately after applying, same sweep CS3's tasks used.

## On completion

- [x] `pnpm typecheck` and `pnpm test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, two corrections from the plan's own checklist, both
found by reading the shipped code before writing.** The MIME allowlist was
deliberately widened beyond the avatar-upload floor with a stated reason
(phase decision 2 explicitly permits this): an image-only list would make
a "let the agent read this file" feature useless for its own purpose. And
the RLS shape for `chat_message_attachments` stayed on 001's original
blanket `for all` pattern rather than copying T-CS3-02's asymmetric
SELECT-only narrowing — that table's narrowing existed because its writes
went through a `SECURITY DEFINER` function, a condition that doesn't apply
here; copying the pattern without checking why it existed would have been
a plausible-looking mistake, the same class this repo's own `chat_messages`
narrowing (014) exists to warn about in the other direction.

Verified live with two real disposable Supabase accounts in two real,
separate workspaces — not a single-session self-test and not SQL-only
assertions: cross-workspace read and write were both genuinely denied by
Postgres, not merely by application code that happened not to ask, and the
bucket's `getPublicUrl` output was confirmed to actually 400 rather than
assumed private from the bucket row's `public: false` flag alone.
`get_advisors` clean, `pnpm --filter @sparstrow/shared typecheck`/`test`
green (320 tests, +4 new for `checkChatAttachmentFile`).
