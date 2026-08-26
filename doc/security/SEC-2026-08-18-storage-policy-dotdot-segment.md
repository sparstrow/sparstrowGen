# SEC-2026-08-18-storage-policy-dotdot-segment

**Status:** 🟢 resolved — found and closed inside the same apply session
**Severity:** low (not exploitable as shipped; a gap between the policy's intent and its behaviour)
**Reported by:** agent — `T-M9-04` verification, evaluating the installed predicate against crafted paths
**Reported:** 2026-08-18

## Summary

The first version of `public-images`' write policies allowed an authenticated
caller to create storage keys containing **another user's id**, by putting a
literal `..` segment in the path.

Filed here rather than in `bug/` because `T-M9-04` routes anything found while
testing these policies to this folder, and because the class of defect — an RLS
predicate that matches more than it reads as matching — is a security question
even when this instance is not exploitable.

## What was wrong

The predicate was:

```sql
bucket_id = 'public-images'
and (storage.foldername(name))[1] = 'avatars'
and (storage.foldername(name))[2] = (select auth.uid())::text
```

`storage.foldername()` splits an object key on `/` and treats `..` as an
**ordinary segment** — it does not normalise. So for the key

```
avatars/<my-id>/../<their-id>/pic.png
```

segment `[1]` is `avatars` and segment `[2]` is still **my own id**, and the
`with check` passes. The policy reads as "you may only write under your own
folder"; it actually meant "your own id must appear in position 2".

## Why it was not exploitable

Established before deciding severity, not assumed:

- **Storage keys are opaque strings, not filesystem paths.** The object lands
  under the literal key `avatars/<my-id>/../<their-id>/pic.png`, which is a
  *different* key from `avatars/<their-id>/pic.png`. Nothing of the other
  user's is overwritten, and nothing of theirs is read.
- **The normalised URL does not resolve to it.** A browser collapses `..` in a
  URL path before sending, so requesting that public URL asks for
  `.../avatars/<their-id>/pic.png` — a different object. The attacker cannot
  even fetch what they wrote through the obvious URL.
- **No object could have been written in the window.** The bucket was created
  and the gap closed in the same session; `storage.objects` for
  `public-images` was empty throughout, and the uploader component that would
  produce these paths (`T-M9-04`'s `<ImageUploadField>`) is not built yet.
  Only a hand-crafted API call could have reached it.

What it *did* allow was a caller minting keys carrying someone else's id
outside their own namespace — junk in a shared bucket, and a confusing artefact
for anyone later auditing who wrote what.

## How it was found

Not by reading the SQL. After applying `013`, the installed predicate was
evaluated against ten crafted paths — another user's folder, a missing owner
segment, an empty owner segment, the bucket root, `avatars-<other-id>/` as a
single filename, an id that has mine as a prefix, deeper nesting, `..`, and the
wrong top-level prefix. Nine behaved as intended. The `..` case returned
`true`.

The two that are worth keeping as regression cases regardless of this fix:

- `avatars/pic.png` → segment `[2]` is `NULL`, and `NULL = anything` is `NULL`,
  not `true`, so it is denied. Correct, but by a mechanism that is easy to
  break.
- `avatars/USER_AB/pic.png` for caller `USER_A` → denied. The comparison is
  equality, not `like`, so an id that merely *starts with* another's does not
  match.

## Resolution

Closed by pinning the depth to exactly the shape the uploader generates:

```sql
and array_length(storage.foldername(name), 1) = 2
```

Added to **all six** write predicates — insert, update `using`, update
`with check`, and delete, for both the `avatars/` and `workspace-logos/`
prefixes. A `..` path has four segments and is now refused; so is any deeper
nesting, which the product has no use for.

- **Source:** [`packages/shared/drizzle/policies/013_storage_images.sql`](../../packages/shared/drizzle/policies/013_storage_images.sql),
  with the reasoning in the comment above the write policies so the guard is
  not "simplified" away later.
- **Applied:** staging migration `storage_images_exact_depth`, 2026-08-18.
- **Verified:** the same ten cases re-run against the predicate read back out
  of `pg_policy` (not retyped) — the `..` case is now `false` and only the
  legitimate path is `true`. `get_advisors(security)` reports no new findings,
  and the `(select auth.uid())` form is intact in the installed expression, so
  it still hoists as an InitPlan.

**Still outstanding:** the genuine cross-account test — a *second real account*
attempting to write into the first's prefix through the storage HTTP API. The
predicate is proved; the end-to-end denial is not. That is `T-M9-06`'s
remaining item and needs a second account this project does not currently have.
