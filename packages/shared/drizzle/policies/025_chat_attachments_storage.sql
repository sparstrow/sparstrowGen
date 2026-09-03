-- 025_chat_attachments_storage.sql
--
-- CS5 (Band 26, T-CS5-01) — the `chat-attachments` bucket and the
-- `chat_message_attachments` table's RLS. A NEW, PRIVATE bucket, not
-- `public-images`: that bucket's own header (013_storage_images.sql)
-- forbids putting anything else in it, and every object there has a
-- permanent, unauthenticated public URL — exactly wrong for conversation
-- content. Every read of an object in THIS bucket goes through a
-- short-lived signed URL minted on demand (T-CS5-03); nothing here ever
-- calls `getPublicUrl`.
--
-- Path shape: <workspace_id>/<session_id>/<uuid>.<ext> — same depth-2
-- prefix-scoped pattern 013 uses for avatars/workspace-logos, but scoped to
-- workspace (not user), matching who is actually authorized to read a chat
-- session's own content: any member of the owning workspace, the same
-- granularity `chat_messages`/`chat_sessions` already grant via 001's
-- blanket workspace-scoped array.
--
-- Apply after 024_provider_model_dispatch.sql. Rerunnable: the bucket
-- upsert and every `drop policy if exists` make a second run a no-op.

-- ── 1. The bucket ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,                                                 -- PRIVATE — see header
  2097152,                                               -- 2 MiB, matches CHAT_ATTACHMENT_MAX_BYTES
  array[
    'image/png', 'image/jpeg', 'image/webp',
    'text/plain', 'text/markdown', 'text/csv',
    'application/json', 'application/pdf'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. RLS must already be on ────────────────────────────────────────────────
--
-- Asserted rather than enabled, exactly as 013 does — `storage.objects`
-- belongs to `supabase_storage_admin`, not to us.

do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    raise exception
      'RLS is not enabled on storage.objects -- the policies in this file would be decoration';
  end if;
end $$;

-- ── 3. Read: workspace members only, via the path-embedded workspace_id ──────
--
-- Unlike 013's public_images_read, this is NOT granted to anon and does NOT
-- cover the whole bucket unconditionally — it is gated on membership, same
-- predicate shape 001_rls.sql's loop uses everywhere else
-- (`workspace_id in (select private.current_workspace_ids())`), applied to
-- the path's own first segment rather than a column, since storage.objects
-- carries no workspace_id column of its own.

drop policy if exists chat_attachments_member_select on storage.objects;
create policy chat_attachments_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] in (select private.current_workspace_ids())
  );

-- ── 4. Write: only into your own workspace's prefix ──────────────────────────
--
-- INSERT only — no UPDATE (an attachment's bytes are immutable once
-- uploaded; T-CS5-02's uploader always writes a fresh uuid-named object,
-- never overwrites) and no DELETE (out of scope for this phase; an
-- orphaned object left behind by a deleted message is the same accepted
-- tradeoff `image-uploader.ts`'s own "best-effort... a wasted couple of
-- megabytes" comment already makes for avatars/logos, not a new one).
--
-- `array_length(...) = 2` pins the depth to exactly what the uploader
-- generates, same reasoning as 013's own comment on this exact guard: without
-- it, `storage.foldername` treats `..` as an ordinary segment, and a path
-- like `<my-workspace>/../<their-workspace>/x.png` would pass a naive [1]
-- check. Pinning the depth closes that.

drop policy if exists chat_attachments_member_insert on storage.objects;
create policy chat_attachments_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] in (select private.current_workspace_ids())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — chat_message_attachments
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The blanket `for all` shape 001's workspace_scoped array grants everywhere
-- else — NOT narrowed the way 014 narrowed chat_messages, because the risk
-- that narrowing existed for doesn't apply here: chat_messages' insert
-- policy was restricted to `role = 'user'` so no workspace member could
-- forge an assistant reply via PostgREST. An attachment row has no
-- equivalent forgeable field — any workspace member creating an attachment
-- row that references a real chat_messages.id in their own workspace is
-- exactly the access they already have to every other workspace-scoped
-- table, including chat_messages/chat_sessions themselves.

alter table public.chat_message_attachments enable row level security;

drop policy if exists chat_message_attachments_member_all on public.chat_message_attachments;
create policy chat_message_attachments_member_all on public.chat_message_attachments
  for all to authenticated
  using (workspace_id in (select private.current_workspace_ids()))
  with check (workspace_id in (select private.current_workspace_ids()));

-- ── 5. Verify after applying ─────────────────────────────────────────────────
--
--   select polname, polcmd from pg_policy
--   where polrelid = 'storage.objects'::regclass
--     and polname like 'chat_attachments_%';                  -- expect 2 rows
--
--   select polname, polcmd from pg_policy
--   where polrelid = 'public.chat_message_attachments'::regclass;  -- expect 1 row
--
--   -- As a member of workspace A, through the storage API:
--   --   upload to <workspace-A-id>/<session-id>/x.png              -- must succeed
--   --   upload to <workspace-B-id>/<session-id>/x.png              -- must be denied
--   --   download an object under <workspace-B-id>/...              -- must be denied
--   --   getPublicUrl on any object in this bucket                  -- must 400/404
--
-- Anything that succeeds there is a finding for doc/security/, not doc/bug/.
