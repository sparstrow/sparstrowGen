# T-M9-03 — Workspace and profile hooks

| | |
|---|---|
| **Tag** | `[C]` — `packages/ui/src/api/hooks.ts` is a ~2100-line shared file other phases also edit; interleavable, but one worker at a time on it |
| **Serves** | **foundational** — the last piece M10 needs before it can build a surface |
| **Depends on** | T-M9-01, T-M9-02 |
| **Blocks** | M10 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Expose the two handlers to `packages/ui` as react-query hooks, following the
patterns already in the file so M10's components look like every other
component in the codebase.

## Decisions already made

### Three hooks, one query key

```ts
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

export function useWorkspace(): UseQueryResult<Workspace, ApiError>
export function useRenameWorkspace(): UseMutationResult<Workspace, ApiError, { name: string }>
export function useUpdateProfile(): UseMutationResult<ProfileRow, ApiError, { name: string }>
```

Query key `["workspace"]`, singular, matching the endpoint. No polling —
a workspace name changes when the owner changes it, and nothing else writes it.
That is the opposite of `useRuntimes`, which polls at 15s precisely because a
machine crossing the staleness threshold changes nothing in the database. State
the contrast in a comment; the next person will otherwise copy the poll.

### Invalidation

- `useRenameWorkspace` → invalidate `["workspace"]`. Nothing else reads it yet;
  M10's derivation reads it through this same hook.
- `useUpdateProfile` → invalidate nothing in react-query. The shell's account
  comes from Supabase's `onAuthStateChange`, **not** from react-query, so the
  name updates through `USER_UPDATED` (see T-M9-02's trap). Adding an
  invalidation here would look like it was doing the work and would not be.
  Say that in a comment, or someone will "fix" it later.

### Response shape

`api()` returns camelCase — the catch-all route converts on the way out. So
`created_at` from the handler arrives as `createdAt`, and `avatar_url` as
`avatarUrl`. Do not add a second conversion.

## Checklist

- [ ] `Workspace` interface exported, placed near the `Runtime` interface
      rather than at the top of the file
- [ ] `useWorkspace`, `useRenameWorkspace`, `useUpdateProfile` added with the
      signatures above
- [ ] The no-polling comment and the no-invalidation comment written — both
      record a decision that looks like an omission
- [ ] `pnpm --filter @sparstrow/ui typecheck` and `pnpm typecheck` green
- [ ] `pnpm test` green

## Traps

**`hooks.ts` is shared with every other phase touching the UI.** Two workers
editing it in parallel will conflict. This task is `[C]`, not `[P]`, for that
reason — check `MasterTaskQueue.md` before starting.

**Do not add `useProfile`.** The account already arrives through context from
the session snapshot ([`account.tsx`](../../../packages/ui/src/lib/account.tsx)).
A react-query copy of the same identity is a second source of truth that will
disagree during the window between a rename and the next `USER_UPDATED`.

**A workspace query that fails must be distinguishable from one that returned
a default name.** M10's derivation needs `"unknown"` for a failed read
(plan decision 5) — that comes from `query.isError`, so do not add a
`placeholderData` or a fallback object that makes failure look like data.

## Verification

- [ ] `pnpm typecheck` clean, `pnpm test` green
- [ ] The hooks return real data against a running app — proved in
      [T-M9-04](T-M9-04-verification.md)

## On completion

- [ ] Tick 11.3 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
- [ ] Update this file's **Status** row and the phase README's task table

## Result

<!-- Filled in when the task lands. -->
