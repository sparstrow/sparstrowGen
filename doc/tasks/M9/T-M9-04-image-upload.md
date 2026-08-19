# T-M9-04 — Avatar and workspace logo upload

| | |
|---|---|
| **Tag** | `[P]` — a bucket, a policy file, and one component; no shared files with 02 or 03 |
| **Serves** | **foundational** — the avatar and logo fields of M10's two forms |
| **Depends on** | T-M9-01 |
| **Blocks** | the image half of `T-M10-02` |
| **Phase spec** | [README.md](README.md) |
| **Status** | 🟡 **half done** — SQL authored (unapplied); the component is held, see the Result |

> **This is the one cuttable task in the plan** (plan decision 7a). Neither
> image gates a setup step (FR-020), and without this both forms still work:
> the shell already renders an initials badge
> ([`workspace-switcher.tsx:38-45`](../../../packages/ui/src/components/layout/workspace-switcher.tsx:38)).
> If it is cut, `T-M9-02` and `T-M9-03` accept only `null` for their URL
> fields, and `T-M10-02` omits the two upload controls. Nothing else changes.

> ⚠️ **Load the `supabase` skill before starting** — AGENTS.md §3.12. This
> creates a storage bucket and writes RLS policies on `storage.objects`.

## Objective

One public bucket, two path prefixes, one upload component. An owner can set an
avatar on their profile and a logo on their workspace, and both render
everywhere the initials badge does today.

## The shape of what was found

**This codebase has never used Supabase Storage.** `grep` for
`supabase.storage`, `storage.from` and `createBucket` across `apps/` and
`packages/` returns nothing. There is no bucket, no policy, no upload helper,
and no size guard to copy. Everything here is new — which is why it is its own
task and why it is the piece most worth cutting under time pressure.

**The display half already exists.** `account.avatarUrl` is read from auth
metadata
([`account-snapshot.ts:37-38`](../../../apps/web/src/lib/auth/account-snapshot.ts:37))
and rendered with an initials fallback. Nothing new is needed to *show* an
avatar — only to get one.

## Decisions already made

### One bucket, two prefixes

```
bucket: "public-images"   (public read)
  avatars/<user_id>/<uuid>.<ext>
  workspace-logos/<workspace_id>/<uuid>.<ext>
```

Two buckets would mean two sets of policies saying nearly the same thing.
One bucket with prefix-scoped policies is the shape Supabase's own guidance
uses, and the prefix is what the policy keys off.

**Public read.** These are an avatar and a logo — they are rendered in an
`<img>` by every member of a workspace, and a signed URL would need refreshing
on a timer for content whose whole purpose is to be looked at. Nothing private
goes in this bucket, and the policies below enforce that only its owner can
*write*.

**A random filename, not the original.** User-supplied filenames carry path
separators, unicode tricks and stale personal information. The extension is
taken from the validated MIME type, not from the name.

### Write policies

- `avatars/<user_id>/…` — insert, update and delete allowed when
  `(select auth.uid())::text` equals the first path segment after the prefix.
- `workspace-logos/<workspace_id>/…` — allowed when that segment is in
  `(select private.current_workspace_ids())`, the same set-returning helper
  every other policy in this repo uses
  ([`policies/README.md`](../../../packages/shared/drizzle/policies/README.md)
  explains why that form and not a per-row function call).

Read is public for the whole bucket.

### Limits, enforced twice

| | |
|---|---|
| Max size | **2 MB** — set on the bucket *and* checked client-side before upload |
| Types | `image/png`, `image/jpeg`, `image/webp` — allowed MIME list on the bucket *and* checked client-side |

The bucket limit is the one that matters; the client check exists so a 5 MB
photo fails instantly with a readable message instead of after a slow upload
and an opaque error.

**No server-side image processing.** No resizing, no re-encoding, no EXIF
stripping. That would mean an image pipeline in a serverless function for a
2 MB ceiling that already bounds the damage. Recorded in
[`../../Ideas.md`](../../Ideas.md) rather than built.

### The old file is deleted when a new one replaces it

Otherwise every avatar change leaves an orphan nothing will ever reference, and
the bucket grows forever. Delete after the new URL is successfully written to
the row — an orphan is a wasted 2 MB, a deleted-too-early file is a broken
image.

### One component, both uses

`<ImageUploadField>` takes a current URL, a target prefix and a save callback.
The profile form and the workspace form pass different prefixes. Building
avatar-only and adding the logo later would mean doing the bucket, the policies
and the guard twice.

## Checklist

- [x] `supabase` skill loaded before any storage work
- [x] Bucket `public-images` created — public read, 2 MB limit, MIME allowlist — **as SQL in 013, applied nowhere**
- [x] Policy file `packages/shared/drizzle/policies/013_storage_images.sql`
      with the write policies above, using
      `(select private.current_workspace_ids())` for the workspace prefix
- [~] Applied to staging; `get_advisors` clean afterwards — **not done**, [`G-20`](../../KnownGaps.md)
- [~] `packages/ui/src/components/image-upload-field.tsx` created — takes a
      current URL, a prefix and an `onUploaded(url)` callback
- [~] All four states: current image / empty (initials + "click to upload") /
      uploading (progress or spinner, control disabled) / error (the real
      reason, image unchanged)
- [~] Client-side size and type check **before** the request, with a message
      naming the actual limit
- [~] Random filename; extension from the validated MIME type
- [~] Previous file deleted after the new URL is saved
- [x] The URL handed to `PATCH /me` / `PATCH /workspace` passes their
      storage-origin check (see those tasks' traps)
- [x] `pnpm typecheck` and `pnpm test` green

## Traps

**A public bucket with a wrong write policy is a public write endpoint.** Get
the path-prefix match right and test it as another user, not only as yourself.
This is the assertion in `T-M9-06` most worth being paranoid about — and
anything found here goes to [`../../security/`](../../security/README.md), not
`bug/`.

**`storage.objects` policies are RLS policies on a table in the `storage`
schema.** They are not bucket settings, they do not appear in the dashboard's
bucket UI, and forgetting them leaves the bucket's defaults in charge.

**A public URL is guessable, and that is fine here and only here.** Never reuse
this bucket for anything that is not an avatar or a logo. Name it in the policy
file's comment so the next person does not.

**The client check is not the security boundary.** Anyone can call the storage
API directly. The bucket's own limit and MIME list are what actually hold.

**Deleting the old file before the new row write succeeds leaves a broken
image.** Order matters: upload → write the row → delete the old file.

## Verification

- [ ] Upload an avatar; it renders in the sidebar and in Settings
- [ ] Upload a workspace logo; it renders wherever the workspace badge shows
- [ ] Replace both; the old objects are gone from the bucket
- [ ] A 3 MB file is refused **client-side** with a readable message
- [ ] A `.pdf` renamed to `.png` is refused — the MIME check, not the extension
- [ ] **As a second account**, attempt to write to the first account's
      `avatars/<their-id>/` prefix directly through the storage API. Denied.
      Proved in [T-M9-06](T-M9-06-verification.md)
- [ ] `get_advisors` reports no new findings

## On completion

- [ ] Tick 11.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table
- [ ] If this task was **cut**, say so in the phase README and open a
      [`../../Deferred.md`](../../Deferred.md) entry with what unparks it —
      a cut feature that leaves no record is indistinguishable from one nobody
      thought of

## Result

**Half landed 2026-08-18. Not cut — split.**

### Done: the whole SQL half

[`policies/013_storage_images.sql`](../../../packages/shared/drizzle/policies/013_storage_images.sql)
carries the bucket (public, 2 MiB, `png`/`jpeg`/`webp`) and **seven policies**:
one public read, then insert/update/delete for each of the two prefixes.
Applied nowhere — [`G-20`](../../KnownGaps.md), same two blockers as the rest of
M9.

Three things worth knowing about it:

- **UPDATE carries `with check` as well as `using`.** Without the second, a
  caller could *move* their own object into someone else's prefix: the row is
  theirs when the policy reads it and not theirs afterwards. This is the trap
  the task's "get the path-prefix match right" was pointing at, and it is not
  visible from testing insert alone.
- **RLS is asserted, not enabled** — `storage.objects` belongs to
  `supabase_storage_admin`, so `alter table` is not ours to run. Same shape as
  `010`'s handling of `realtime.messages`, and it raises rather than proceeding,
  because a false assumption here means the bucket is world-writable and all
  seven policies are decoration.
- **The logo prefix keys on workspace *membership*, not admin.** Deliberate:
  `workspaces_admin_update` already means a non-admin cannot attach the logo to
  the row, so their upload is a wasted 2 MB rather than a privilege. Making the
  storage policy admin-only as well would be a second, subtly different copy of
  an authorization rule.

The header says at length that **nothing else may ever go in this bucket** —
every object in it has a guessable, permanent, unauthenticated URL.

### Held: `<ImageUploadField>`

Not cut — **held**, which is a different state and needs no `Deferred.md` entry
(nothing has been given up). Two reasons, and the first is the operative one:

1. **The design system is being rebuilt in a parallel worktree.** A new
   component with four states, written now against `globals.css` as it stands
   today, is the most likely thing in this phase to be rewritten on contact —
   see [`G-19`](../../KnownGaps.md), which says §2 of the doctrine describes a
   theming system the app does not yet have. Building it after that lands costs
   nothing extra; building it before costs it twice.
2. It cannot be exercised at all until the bucket exists, so it would ship
   unverified even by the standards the rest of M9 is being held to.

**Nothing downstream is blocked by the hold.** Both handlers already validate
the URL and correctly refuse every non-null value today, because no URL can yet
satisfy the check. `T-M10-02` omits the two controls, exactly as the cut path
described — the difference is that the SQL is in the tree, so resuming is
writing one component rather than re-deciding a bucket, seven policies and a
security boundary.
