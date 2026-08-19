-- 013_storage_images.sql
--
-- The `public-images` bucket, and the write policies that keep it from being a
-- public write endpoint.
--
-- T-M9-04. One bucket, two path prefixes:
--
--   avatars/<user_id>/<uuid>.<ext>
--   workspace-logos/<workspace_id>/<uuid>.<ext>
--
-- Two buckets would mean two sets of policies saying nearly the same thing. One
-- bucket with prefix-scoped policies is the shape Supabase's own guidance uses,
-- and the prefix is what the policy keys off.
--
-- ── THIS BUCKET IS PUBLICLY READABLE, AND THAT IS THE POINT ──────────────────
--
-- An avatar and a logo are rendered in an <img> by every member of a workspace.
-- A signed URL would need refreshing on a timer for content whose entire
-- purpose is to be looked at. So every object here has a guessable, permanent,
-- unauthenticated URL.
--
-- **NEVER PUT ANYTHING ELSE IN THIS BUCKET.** Not an export, not an upload, not
-- an attachment, not "just this one file". If a future feature needs stored
-- files, it needs its own bucket with its own read policy. The name says
-- `public-images` so that this is hard to forget; this comment exists because
-- the name alone has not been enough anywhere else it has been tried.
--
-- ── What actually enforces what ──────────────────────────────────────────────
--
-- The size limit and MIME allowlist below are the real boundary. The client
-- checks the same two things before uploading, but only so that a 5 MB photo
-- fails instantly with a readable message instead of after a slow upload and an
-- opaque error -- anyone can call the storage API directly, so the client check
-- is a courtesy and this file is the security.
--
-- `storage.objects` policies are ordinary RLS policies on a table in the
-- `storage` schema. They are NOT bucket settings, they do not appear in the
-- dashboard's bucket UI, and omitting them leaves the bucket's defaults in
-- charge of who may write.
--
-- Apply after 012_no_invented_names.sql. Rerunnable: the bucket upsert and
-- every `drop policy if exists` make a second run a no-op.

-- ── 1. The bucket ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-images',
  'public-images',
  true,
  2097152,                                              -- 2 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. RLS must already be on ────────────────────────────────────────────────
--
-- Asserted rather than enabled, exactly as 010 does for `realtime.messages` and
-- for the same reason: `storage.objects` belongs to `supabase_storage_admin`,
-- not to us, so `alter table ... enable row level security` is not ours to run.
-- Supabase enables it by default -- and if that ever stops being true, every
-- policy below is decoration and this bucket is world-writable, so this raises
-- rather than proceeding.

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

-- ── 3. Read: public, for this bucket only ────────────────────────────────────
--
-- Downloads from a public bucket do not consult this policy; the public
-- endpoint serves them directly. It is here so that *listing* works, and so the
-- read grant is written down beside the write grants rather than being an
-- invisible property of the bucket row above.

drop policy if exists public_images_read on storage.objects;
create policy public_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'public-images');

-- ── 4. Write: only into your own prefix ──────────────────────────────────────
--
-- `storage.foldername(name)` splits the object path into its folder segments,
-- 1-indexed. For `avatars/<user_id>/<uuid>.png` that is `{avatars, <user_id>}`,
-- so [1] is the prefix and [2] is the owner.
--
-- UPDATE carries both `using` and `with check`. Without the second, a caller
-- could *move* their own object into someone else's prefix -- the row is theirs
-- when the policy reads it and not theirs afterwards.
--
-- `array_length(...) = 2` pins the depth to exactly the shape the uploader
-- generates. It is not decoration: `storage.foldername` treats `..` as an
-- ordinary segment, so WITHOUT this guard the path
--
--     avatars/<my-id>/../<their-id>/pic.png
--
-- passes the [1]/[2] test, because [2] is still my own id. That is not a
-- traversal -- storage keys are opaque strings, so the object lands under that
-- literal key and overwrites nothing -- but it lets a caller mint keys carrying
-- someone else's id outside their own namespace, which is exactly what these
-- policies exist to prevent. Found by evaluating the predicate against crafted
-- paths after applying, not by reading it.

-- avatars/<user_id>/...
drop policy if exists public_images_avatar_insert on storage.objects;
create policy public_images_avatar_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists public_images_avatar_update on storage.objects;
create policy public_images_avatar_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists public_images_avatar_delete on storage.objects;
create policy public_images_avatar_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- workspace-logos/<workspace_id>/...
--
-- `(select private.current_workspace_ids())` rather than a per-row function
-- taking the segment as an argument. It takes no arguments, so Postgres
-- evaluates it once as an InitPlan instead of once per row -- the same form
-- every other policy in this repo uses, and the reason is in policies/README.md.
--
-- Note this is workspace MEMBERSHIP, not admin. Deliberate: `workspaces` itself
-- is admin-only to update, so a non-admin who uploads a logo cannot then attach
-- it to the workspace row. The upload without the attach is a wasted 2 MB, not
-- a privilege.

drop policy if exists public_images_logo_insert on storage.objects;
create policy public_images_logo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'workspace-logos'
    and (storage.foldername(name))[2] in (select private.current_workspace_ids())
  );

drop policy if exists public_images_logo_update on storage.objects;
create policy public_images_logo_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'workspace-logos'
    and (storage.foldername(name))[2] in (select private.current_workspace_ids())
  )
  with check (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'workspace-logos'
    and (storage.foldername(name))[2] in (select private.current_workspace_ids())
  );

drop policy if exists public_images_logo_delete on storage.objects;
create policy public_images_logo_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'public-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'workspace-logos'
    and (storage.foldername(name))[2] in (select private.current_workspace_ids())
  );

-- ── 5. Verify after applying ─────────────────────────────────────────────────
--
-- A path with no second segment -- `avatars/x.png` -- yields NULL at [2], and
-- `NULL = anything` is NULL, not true, so it fails the check. Confirm rather
-- than trust that reading, and confirm the cross-user denial as a SECOND
-- account rather than as yourself:
--
--   select polname, polcmd from pg_policy
--   where polrelid = 'storage.objects'::regclass
--     and polname like 'public_images_%';       -- expect 7 rows
--
--   -- As account B, through the storage API, both must be denied:
--   --   upload to avatars/<account-A-id>/x.png
--   --   upload to workspace-logos/<account-A-workspace-id>/x.png
--
-- Anything that succeeds there is a finding for doc/security/, not doc/bug/.
