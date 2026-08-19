# T-M9-03 — Profile read and update

| | |
|---|---|
| **Tag** | `[P]` — a new handler file; shares nothing with T-M9-02 |
| **Serves** | **foundational** — unblocks M10's profile form and its step-1 completion rule |
| **Depends on** | T-M9-01 |
| **Blocks** | T-M9-05, and M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-18) — live round-trip deferred to `T-M9-06` |

## Objective

`GET /api/v1/me` and `PATCH /api/v1/me`, carrying the three fields the profile
setup form owns: **avatar, name, about you** — with the name written to both
places a display name lives.

Serves FR-018 and FR-020.

## Decisions already made

Phase decision 3 and plan decisions 7 and 9 are the source.

### `GET /me` now exists, and why that changed

An earlier draft said it should not, because the shell already has the account
from the session snapshot. That held while the profile was one name. It does
not now: **`bio` is not in the session metadata** (plan decision 9 keeps it
out deliberately — the shell never renders it, and it would inflate every
request's token), so the form has nowhere else to read it from.

```ts
.from("users").select("id, email, name, avatar_url, bio").eq("id", user.id).single()
```

The shell keeps reading the session snapshot for the sidebar. This endpoint
serves the **form**, and the two do not compete: one shows a name, the other
edits three fields.

### `PATCH /me` — three accepted fields, two stores

| Field | Rule | Written to |
|---|---|---|
| `name` | trimmed, **may be empty**, max 60 | auth metadata **and** `public.users` |
| `bio` | trimmed, max 2000 | `public.users` only |
| `avatar_url` | a URL this app produced, or `null` | auth metadata **and** `public.users` |

```ts
// 1. The session's metadata -- what the shell reads.
const { error: authError } = await supabase.auth.updateUser({
  data: { name, full_name: name, avatar_url: avatarUrl },
});
if (authError) throw authError;

// 2. The public.users row -- what the cloud schema joins on.
const { data, error } = await supabase
  .from("users")
  .update({ name, bio, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
  .eq("id", user.id)
  .select("id, email, name, avatar_url, bio")
  .single();
if (error) throw error;
```

**Both metadata keys for the name.** `bootstrap_workspace` reads `full_name`
first and `name` second, so writing both means a future bootstrap finds the
chosen name.

**Auth first, then the row.** If the row update fails, the handler throws and
the caller sees an error — a half-applied change is visible rather than silent.
Reversed, a failing auth update after a successful row update would leave the
shell showing the old value with no error at all, which reads as "the save
didn't work" and is harder to diagnose.

**Partial `PATCH`, like the workspace handler.** Only the keys present are
written. Sending only `bio` must not blank the name.

**Empty name is allowed.** Same reasoning as `T-M9-02`: `T-M9-01` makes `''`
the starting state, so the API must be able to write it. The *setup step*
reads empty as not-done; that is a UI reading, not a constraint.

### No transaction, and that is a stated limitation

`supabase.auth.updateUser` goes through GoTrue, not PostgREST, so the two
writes cannot share a transaction. The window is narrow and recovery is "press
save again", which the UI can offer because the handler reports the error
rather than swallowing it.

**Rejected:** a Postgres trigger mirroring `auth.users.raw_user_meta_data` into
`public.users`. That is a schema change with its own security review — and this
repo has already had one incident caused by an `auth.users` trigger nobody
remembered
([`SEC-2026-08-16-auth-users-auto-confirm-trigger`](../../security/SEC-2026-08-16-auth-users-auto-confirm-trigger.md)).

### Not accepted: email, password, role

An email change is an auth flow with a confirmation loop. `role` is
authorization data and must never be settable by its own subject.

## Checklist

- [x] `apps/web/src/lib/api/handlers/profile.ts` created with both routes
- [x] Imported in `handlers/index.ts` **before** the `./stubs` import
- [x] Partial `PATCH`: only the keys present are written
- [x] Both stores written, in the order above
- [x] `bio` written to `public.users` only — **not** to auth metadata
- [x] Length validation: name 60, bio 2000, with specific messages
- [x] Empty `name` accepted
- [x] `email`, `password`, `role`, `id` in the body → `400` naming the key
- [x] Unauthenticated → `401`
- [x] Router-level tests: read; set each field alone; set all three; empty
      name; 61-char name; 2001-char bio; a body containing `role` (400); a
      body containing `email` (400)
- [x] `pnpm --filter web test` and `pnpm typecheck` green

## Traps

**`avatar_url` accepts any URL unless it is checked.** Same defect as the
workspace logo: an arbitrary URL rendered for every viewer is a tracking pixel
at minimum. Validate `null`-or-under-this-project's-storage-origin. This check
must exist **even if `T-M9-04` is cut** — in which case only `null` is
accepted.

**`public.users` is not `auth.users`.** They share an id and nothing else.
Updating the wrong one produces a change that works everywhere except the
sidebar, or everywhere except the cloud schema.

**The shell will not show a new name until `USER_UPDATED` fires.**
`supabase.auth.updateUser` emits it and `WebAccountProvider` listens
([`account-provider.tsx:35`](../../../apps/web/src/components/auth/account-provider.tsx:35)),
so the sidebar changes without a reload — but only in the tab that made the
call. `T-M10-02` must verify this visually rather than assume it from a 200.

**RLS on `public.users`.** The row is the caller's own, so the policy should
permit it — **confirm the policy allows `UPDATE` and not only `SELECT`** before
assuming. If it does not, that is a policy addition, and per AGENTS.md §3.12
the `supabase-postgres-best-practices` skill is loaded before writing it.

**`users.updated_at` exists** (`notNull().defaultNow()`), confirmed in
`schema.ts` — so writing it is correct here, unlike the speculative note an
earlier draft carried.

## Verification

- [x] `pnpm --filter web test` — every case in the checklist
- [x] `pnpm typecheck` clean
- [~] A live edit, confirmed in **both** stores — the shell's displayed name and
      a direct read of `public.users` — is proved in
      [T-M9-06](T-M9-06-verification.md). Still outstanding
      ([`G-20`](../../KnownGaps.md))

## On completion

- [x] Tick 11.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table

## Result

**Landed 2026-08-18.** `GET`/`PATCH /api/v1/me` in
[`handlers/profile.ts`](../../../apps/web/src/lib/api/handlers/profile.ts),
registered before `./stubs`. **22 tests**, all green
([`profile-routes.test.ts`](../../../apps/web/src/lib/api/profile-routes.test.ts));
`pnpm typecheck` and the full `apps/web` suite (215 tests) green.

### The RLS trap was checked, not assumed

`users_self_update` exists in
[`001_rls.sql:177-181`](../../../packages/shared/drizzle/policies/001_rls.sql:177)
with **both** `using` and `with check` on `id = (select auth.uid())::text`. No
policy addition needed, so no migration and no second `supabase-postgres-best-practices`
pass. Recorded because the task said to confirm rather than assume, and the
answer being "already fine" is worth the same one line as the answer being "add
one".

### What the tests actually pin

Not the 200 — the **store each field lands in**, which no status code reveals:

- `name` → auth metadata under **both** `full_name` and `name`, *and* the row.
- `bio` → the row **only**. Asserted as `metadataWrites` being exactly `[]`,
  so a future "tidy" that folds bio into the metadata object fails here rather
  than in production, where it would ride along in every JWT.
- `avatar_url` → both.
- A PATCH carrying one field does not blank the others.
- Auth failing means the row is **not** written — the ordering decision, proved
  rather than commented.

### One thing found, filed rather than fixed

[`BUG-2026-08-18-shell-invents-name-from-email`](../../bug/BUG-2026-08-18-shell-invents-name-from-email.md).

`toSnapshot()` derives the shell's account name as
`full_name || name || email.split("@")[0] || "Account"` — the **same FR-019
invention `T-M9-01` removed from the database**, surviving in the session store.
It has a specific consequence for this task: because the chain tests
truthiness, writing `full_name: ""` (which is exactly what `PATCH /me` does when
someone clears their name) falls straight through to the email local part. **The
clear looks like a failed save.**

Not fixed here, deliberately. Removing the fallback is one line; deciding what
the shell shows for an account with no name — `"Account"`, the email, initials,
a nameless avatar — is a design call on an always-visible surface, and
`T-M10-04` already edits that component for the workspace name. Writing
`null` instead of `""` to metadata was considered and rejected: it only moves
the wrong answer from the email to `"Account"` and leaves the fallback in place.

### Also noted, not a defect

`workspaces_admin_update` scopes `PATCH /workspace` (T-M9-02) to admins/owners,
so a plain **member** gets zero rows back and therefore a `404`. Correct
behaviour — a member should not rename the workspace — but `404` after a
successful `GET` reads oddly. Unreachable today (invites are out of scope and
every workspace has exactly one member), so it is not worth special-casing;
noted so M10's error state is not surprised by it if invites ever land.
