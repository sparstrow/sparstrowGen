# T-M9-04 — Avatar and workspace logo upload

| | |
|---|---|
| **Tag** | `[P]` — a bucket, a policy file, and one component; no shared files with 02 or 03 |
| **Serves** | **foundational** — the avatar and logo fields of M10's two forms |
| **Depends on** | T-M9-01 |
| **Blocks** | the image half of `T-M10-02` |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ **done (2026-08-20)** — component built, wired into both hosts, and its storage-layer security proved live against staging with two real accounts. See the Result |

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
- [x] Bucket `public-images` created — public read, 2 MiB limit, MIME allowlist — **applied to staging**
- [x] Policy file `packages/shared/drizzle/policies/013_storage_images.sql`
      with the write policies above, using
      `(select private.current_workspace_ids())` for the workspace prefix
- [x] Applied to staging; `get_advisors` clean afterwards — confirmed, no new findings
- [x] `packages/ui/src/components/image-upload-field.tsx` created — takes a
      current URL, a prefix and an `onSave(url)` callback
- [x] All four states: current image / empty (caller-supplied fallback +
      "Upload …") / uploading (spinner overlay, controls disabled) / error
      (the real reason, image unchanged)
- [x] Client-side size and type check **before** the request, with a message
      naming the actual limit (`checkImageFile()`, `@sparstrow/shared`)
- [x] Random filename; extension from the validated MIME type
- [x] Previous file deleted after the new URL is saved
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

- [~] Upload an avatar; it renders in the sidebar and in Settings — the
      storage half is proved (below); the rendered half needs `T-M10-02`,
      which has not been built yet
- [~] Upload a workspace logo; it renders wherever the workspace badge shows —
      same caveat
- [~] Replace both; the old objects are gone from the bucket — the component's
      upload→save→delete-old order is implemented and code-reviewed, but
      exercising it live needs a consuming form (`T-M10-02`); a *direct*
      replace-in-place was proved instead (below)
- [x] A 3 MB file is refused **client-side** with a readable message —
      `checkImageFile()` unit-tested in `packages/shared/src/image-upload.test.ts`
- [x] A `.pdf` renamed to `.png` is refused — proved live against staging: the
      bucket's MIME allowlist reads the declared `Content-Type`, not the key
- [x] **As a second account**, attempt to write to the first account's
      `avatars/<their-id>/` prefix directly through the storage API. Denied.
      Proved live against staging with two real accounts (below) — the
      policies are symmetric per-caller, so A-cannot-write-B's proves the
      general case
- [x] `get_advisors` reports no new findings — unchanged since 2026-08-18; no
      new migration landed with this task

## On completion

- [x] Tick 11.4 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table
- [x] Not cut — completed. No `Deferred.md` entry needed.

## Result

**Half landed 2026-08-18. Not cut — split.**

### Done: the whole SQL half

[`policies/013_storage_images.sql`](../../../packages/shared/drizzle/policies/013_storage_images.sql)
carries the bucket (public, 2 MiB, `png`/`jpeg`/`webp`) and **seven policies**:
one public read, then insert/update/delete for each of the two prefixes.
**Applied to staging 2026-08-18** as migrations `storage_images` and
`storage_images_exact_depth`. `get_advisors` clean — and notably no
`auth_rls_initplan` warning, which confirms the `(select auth.uid())` /
`(select private.current_workspace_ids())` form hoists as an InitPlan rather
than running per row.

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

### Verification found a real gap, which is the point of verifying

After applying, the installed predicate was evaluated against ten crafted paths
rather than re-read. Nine behaved correctly — another user's folder, a missing
owner segment (`NULL`, so denied), an empty owner segment, the bucket root,
`avatars-<other-id>/` as one filename, and an id merely *starting with* the
caller's, all refused.

The tenth did not. `avatars/<my-id>/../<their-id>/pic.png` was **allowed**:
`storage.foldername` treats `..` as an ordinary segment, so `[2]` was still the
caller's own id. Not exploitable — storage keys are opaque strings, so it is a
different key from the victim's and overwrites nothing, and a browser normalises
`..` out of the URL before sending — but it let a caller mint keys carrying
someone else's id outside their namespace, which is what these policies exist to
prevent.

Closed the same session by pinning depth: `array_length(storage.foldername(name), 1) = 2`,
on all six write predicates. Re-verified against the expression read back out of
`pg_policy`: the `..` case is now `false` and only the legitimate path is `true`.
Written up as
[`SEC-2026-08-18-storage-policy-dotdot-segment`](../../security/SEC-2026-08-18-storage-policy-dotdot-segment.md),
per this task's instruction that storage-policy findings go to `security/`.

**What is still not proved:** the end-to-end denial — a *second real account*
attempting the write through the storage HTTP API. The predicate is proved; the
round trip is not, and needs a second account this project does not have.

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

### Resumed and completed — 2026-08-20

The hold's reason 1 — "the design system is being rebuilt in a parallel
worktree" — was PR #100 (D2 parametric theming), merged 2026-08-18 and rebased
into `T-M8-02`'s branch the same week. `DESIGN.md` §2's theming contract is now
real in `globals.css`, so building against it no longer risks a rewrite on
contact. Reason 2 — "cannot be exercised until the bucket exists" — no longer
applies either: the bucket has been live on staging since 2026-08-18.

#### `<ImageUploadField>`, and how it gets a Supabase client

[`packages/ui/src/components/image-upload-field.tsx`](../../../packages/ui/src/components/image-upload-field.tsx),
one component for both avatar and logo, taking `currentUrl`, `prefix`, `onSave`,
`label`, and a caller-supplied `fallback` node for the empty tile (initials or
an icon — the component has no way to derive either, since it doesn't know
whose image this is).

**`@sparstrow/ui` cannot construct a Supabase client itself** — it is shared
with the local desktop build, which has no Supabase project to point at, and
building one from env vars would mean this package reading `NEXT_PUBLIC_*`
variables only `apps/web` knows how to resolve. This codebase already has the
answer for exactly this shape of problem: `LiveEventSource`
([`packages/ui/src/lib/live-events.ts`](../../../packages/ui/src/lib/live-events.ts))
and `Account`
([`packages/ui/src/lib/account.tsx`](../../../packages/ui/src/lib/account.tsx))
are both host-varying capabilities injected via React context, defaulting to
`null`/the local behaviour, with `apps/web` providing the real implementation.
[`packages/ui/src/lib/image-upload.tsx`](../../../packages/ui/src/lib/image-upload.tsx)
follows the same shape: an `ImageUploader` interface (`upload`, `remove`),
default `null`. `<ImageUploadField>` renders nothing when the context is
`null` — not a disabled control, per AGENTS.md's rule against documenting or
displaying what a host cannot do — which is automatically correct for the
desktop build without it needing to know why.

`apps/web` wires the real implementation
([`apps/web/src/lib/storage/image-uploader.ts`](../../../apps/web/src/lib/storage/image-uploader.ts))
into [`WebAccountProvider`](../../../apps/web/src/components/auth/account-provider.tsx),
reusing the same browser Supabase client the account context already builds —
one client, one memo, two contexts fed from it.

**One small consolidation while wiring this up:** `PUBLIC_IMAGE_BUCKET` had
exactly one copy, in `apps/web/src/lib/api/storage-url.ts`. The new client-side
uploader needed the same name, and the component needed the same size/MIME
limits for its pre-request check — a second hand-copied bucket name is the
exact drift `storage-url.ts`'s own comment warns against ("two hand-copied
origin checks would drift, in the direction of accepting more"). Moved
`PUBLIC_IMAGE_BUCKET`, plus new `PUBLIC_IMAGE_MAX_BYTES` /
`PUBLIC_IMAGE_ALLOWED_TYPES` / `checkImageFile()`, into
`packages/shared/src/constants.ts`; `storage-url.ts` now imports the bucket
name rather than declaring it.

#### Proved live against staging, not just typechecked

`get_advisors` and the ten-crafted-path predicate check from 2026-08-18 proved
the *policy expression*. What had not been proved was the actual HTTP round
trip through the storage API as a second real account — the task's own "most
worth being paranoid about" assertion. Two disposable `*@sparstrow.test`
accounts were minted via the runbook's `generateLink` + `verifyOtp` procedure
(the same exchange `/auth/confirm` performs — not a bypass), each bootstrapped
through the real `bootstrap_workspace` RPC, then driven directly against
`storage.objects` with the anon-key client each would actually use in the
browser. All nine assertions passed:

| Assertion | Result |
|---|---|
| A can upload into their own `avatars/` prefix | ✅ succeeded |
| The uploaded object is publicly readable | ✅ `200` |
| A can upload into their own `workspace-logos/` prefix (membership, not admin) | ✅ succeeded |
| A is denied writing into B's `avatars/` prefix | ✅ denied — RLS |
| A is denied writing into B's `workspace-logos/` prefix | ✅ denied — RLS |
| A is denied the `..` path minting B's id outside A's own namespace | ✅ denied — RLS (the `array_length(...) = 2` guard from the 2026-08-18 fix) |
| The bucket itself refuses a 2 MiB + 1 KiB file, client check bypassed | ✅ denied — "The object exceeded the maximum allowed size" |
| The bucket refuses `application/pdf` bytes under a `.png`-looking key | ✅ denied — "mime type application/pdf is not supported" |
| A can replace (`update`) their own avatar object in place | ✅ succeeded |

Both accounts, their workspaces, and every object written during the pass were
deleted afterward — direct table deletes in the same order the runbook's SQL
uses (`workspaces` → `public.users` → `auth.users`), not `admin.deleteUser`
alone, which the runbook documents as leaving orphans
([`BUG-2026-08-18-orphaned-account-rows-on-staging`](../../bug/BUG-2026-08-18-orphaned-account-rows-on-staging.md)).
The verification script itself was scratch (Node + `@supabase/supabase-js`,
run from `apps/web` so module resolution worked) and was deleted after the
run; it is not part of this tree.

**What this does and does not close.** This proves the storage bucket's write
and read policies for real, and proves `checkImageFile()`'s logic in isolation
(`packages/shared/src/image-upload.test.ts`). It does **not** prove the
component renders correctly, because nothing consumes it yet —
`ProfileForm`/`WorkspaceForm` are `T-M10-02`, not started. `T-M9-06`'s Section D
is updated with the same evidence rather than restated; its remaining items
(the rendered upload/replace flow through the actual component) stay open
until `T-M10-02` gives it a page to run on.

`pnpm typecheck` (all 7 packages) and `pnpm test` are green except the
pre-existing, already-documented flake in
[`BUG-2026-08-20-flaky-realtime-live-events-test`](../../bug/BUG-2026-08-20-flaky-realtime-live-events-test.md)
(unrelated — passes standalone every time it was retried).
