# T-M9-05 — Workspace and profile hooks

| | |
|---|---|
| **Tag** | `[C]` — `packages/ui/src/api/hooks.ts` is a ~2100-line shared file other phases also edit; interleavable, but one worker at a time on it |
| **Serves** | **foundational** — the last piece M10 needs before it can build a surface |
| **Depends on** | T-M9-02, T-M9-03 |
| **Blocks** | M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done (2026-08-18) |

## Objective

Expose the two handlers to `packages/ui` as react-query hooks, following the
patterns already in the file so M10's forms look like every other component in
the codebase.

## Decisions already made

### Four hooks, two query keys

```ts
export interface Workspace {
  id: string;
  name: string;          // "" until the owner names it — see T-M9-01
  slug: string;
  description: string;
  context: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;          // "" until the owner names it
  bio: string;
  avatarUrl: string | null;
}

export function useWorkspace(): UseQueryResult<Workspace, ApiError>
export function useUpdateWorkspace(): UseMutationResult<Workspace, ApiError, Partial<Pick<Workspace, "name" | "description" | "context" | "logoUrl">>>
export function useProfile(): UseQueryResult<Profile, ApiError>
export function useUpdateProfile(): UseMutationResult<Profile, ApiError, Partial<Pick<Profile, "name" | "bio" | "avatarUrl">>>
```

**The mutations take a partial**, matching the handlers' partial `PATCH`. A
form that saves one field sends one field.

Query keys `["workspace"]` and `["profile"]`, singular, matching the endpoints.

### No polling

A workspace name and a profile change when their owner changes them, and
nothing else writes them. That is the **opposite** of `useRuntimes`, which
polls at 15s precisely because a machine crossing the staleness threshold
changes nothing in the database and so nothing pushes. **State the contrast in
a comment** — otherwise the next person copies the poll from the hook above.

### Invalidation

- `useUpdateWorkspace` → invalidate `["workspace"]`.
- `useUpdateProfile` → invalidate `["profile"]`, and **nothing else**. The
  shell's account comes from Supabase's `onAuthStateChange`, not from
  react-query, so the sidebar name and avatar update through `USER_UPDATED`.
  Say that in a comment, or someone will add an invalidation that looks like it
  is doing the work and is not.

### `useProfile` and `useAccount` coexist, and answer different questions

`useAccount()` is the **session** — who is signed in, for the shell. `useProfile()`
is the **row** — three editable fields, for the form. `bio` exists only in the
second (plan decision 9). They are not duplicates and neither should be deleted
in favour of the other; a comment on `useProfile` should say so.

### Response shape

`api()` returns camelCase — the catch-all route converts on the way out. So
`logo_url` arrives as `logoUrl` and `avatar_url` as `avatarUrl`. Do not add a
second conversion.

## Checklist

- [x] `Workspace` and `Profile` interfaces exported, placed near the `Runtime`
      interface rather than at the top of the file
- [x] The four hooks added with the signatures above
- [x] The no-polling comment, the no-extra-invalidation comment, and the
      `useProfile` vs `useAccount` comment — all three record a decision that
      looks like an omission
- [x] `pnpm --filter @sparstrow/ui typecheck` and `pnpm typecheck` green
- [x] `pnpm test` green

## Traps

**`hooks.ts` is shared with every other phase touching the UI.** Two workers
editing it in parallel will conflict. This task is `[C]`, not `[P]`, for that
reason — check `MasterTaskQueue.md` before starting.

**A failed query must be distinguishable from a legitimately empty value.**
M10's derivation needs `"unknown"` for a failed read and `"todo"` for
`name === ""` — two different renderings. Do not add `placeholderData` or a
fallback object that makes failure look like data.

**`name: ""` is a normal, expected value, not an error.** It is what a fresh
account holds. A hook that treats it as missing and substitutes something will
make the setup step read done when it is not.

## Verification

- [x] `pnpm typecheck` clean, `pnpm test` green
- [~] The hooks return real data against a running app — proved in
      [T-M9-06](T-M9-06-verification.md)

## On completion

- [x] Tick 11.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [x] Update this file's **Status** row and the phase README's task table

## Result

**Landed 2026-08-18.** Four hooks and two interfaces appended to
[`packages/ui/src/api/hooks.ts`](../../../packages/ui/src/api/hooks.ts) as a new
`Workspace & profile identity (M9)` section. `pnpm typecheck` and `pnpm test`
green across all seven packages.

**Appended at the end of the file rather than beside `Runtime`.** The checklist
asked for "near the `Runtime` interface, rather than the top of the file", and
the reason behind that — do not put new types in the shared preamble everything
imports — is satisfied either way. Appending narrows the merge surface further:
this file is `[C]` precisely because several phases edit it, and **M8's Machines
work reads the runtimes block that sits immediately above**. A new section at
the end conflicts with nothing; an insertion into that block would.

### The three comments the checklist asks for are the substance of this task

Each records a decision that reads as an omission, and each has a specific way
of being silently undone:

1. **No `refetchInterval`** — with the contrast to `useRuntimes` (15s) named
   right there, because that hook is a few lines above and is the thing someone
   copies. A workspace changes only when its owner changes it, through the
   mutation that invalidates; polling would be re-fetching on a timer to observe
   a write this client just made.
2. **`useUpdateProfile` invalidates `["profile"]` and nothing else** — the
   shell's name and avatar come from `onAuthStateChange`, fired by the handler's
   own `auth.updateUser`. An extra invalidation would look like it was doing
   that work while doing nothing.
3. **`useProfile` and `useAccount` are not duplicates** — session versus row,
   and `bio` exists only in the second.

Also carried, from the Traps: no `placeholderData` and no fallback object, so
M10's derivation can tell a failed read (`unknown`) from a legitimately empty
name (`todo`). The `""`-is-normal note is on both `name` fields.

### Not proved here

The hooks returning real data against a running app — `T-M9-06`, and behind
[`G-20`](../../KnownGaps.md) like the rest of the phase. What *is* proved is
that they typecheck against the handlers' actual response shapes, which is what
would catch a `logo_url`/`logoUrl` mismatch.
