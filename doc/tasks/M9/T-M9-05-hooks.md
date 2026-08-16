# T-M9-05 — Workspace and profile hooks

| | |
|---|---|
| **Tag** | `[C]` — `packages/ui/src/api/hooks.ts` is a ~2100-line shared file other phases also edit; interleavable, but one worker at a time on it |
| **Serves** | **foundational** — the last piece M10 needs before it can build a surface |
| **Depends on** | T-M9-02, T-M9-03 |
| **Blocks** | M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

- [ ] `Workspace` and `Profile` interfaces exported, placed near the `Runtime`
      interface rather than at the top of the file
- [ ] The four hooks added with the signatures above
- [ ] The no-polling comment, the no-extra-invalidation comment, and the
      `useProfile` vs `useAccount` comment — all three record a decision that
      looks like an omission
- [ ] `pnpm --filter @sparstrow/ui typecheck` and `pnpm typecheck` green
- [ ] `pnpm test` green

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

- [ ] `pnpm typecheck` clean, `pnpm test` green
- [ ] The hooks return real data against a running app — proved in
      [T-M9-06](T-M9-06-verification.md)

## On completion

- [ ] Tick 11.5 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
