# WA1 — every write becomes a Server Action

| | |
|---|---|
| **Plan** | [`../../plans/2026-08-24-server-action-write-conversion.md`](../../plans/2026-08-24-server-action-write-conversion.md) (WA1) |
| **Kind** | **foundational** — nothing here demos; the owner clicks the same buttons and sees the same results |
| **Spec** | n/a (internal) |
| **Depends on** | — |
| **Blocks** | WA2 (the read conversions that make these writes one round trip) |
| **Status** | not started |
| **Open questions** | none — [`OQ-7`](../../OpenQuestions.md) closed 2026-08-24, option A |

## What all these tasks share

Every task in this phase does the same five things to a different cluster of
pages. The shape is written once here; a task document says only what is
specific to its files.

1. Create `apps/web/src/app/<route>/actions.ts` with `"use server"` at the top.
2. Move each mutation's body out of its `/api/v1` handler into an action,
   keeping the validation and the error text **byte for byte**.
3. Replace the `useXxx()` call in the client island with a direct call to the
   action, wrapped in `useTransition` for pending state.
4. Delete the now-unreferenced mutation hook from
   [`hooks.ts`](../../../apps/web/src/api/hooks.ts) and the now-unreferenced
   handler from `apps/web/src/lib/api/handlers/`.
5. Keep the existing `queryClient.invalidateQueries()` call **exactly where it
   is** — this page's read has not moved yet (plan DD-1).

## Phase decisions

These are the plan's DD-1 through DD-6, and they are not restated here — read
them there. What follows is the phase-level detail the plan deliberately left
to decomposition.

### The result type lives in one file and is imported everywhere

`apps/web/src/lib/action-result.ts`, created by `T-WA-01`:

```ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export function actionOk<T>(data: T): ActionResult<T> { return { ok: true, data }; }
export function actionFail(error: string, field?: string): ActionResult<never> {
  return { ok: false, error, field };
}
```

This is the one shared module the plan's DD-2 ("never a shared barrel") does
**not** forbid: it holds a type and two constructors, no route's business logic,
and nothing that grows as pages are converted.

### Every action starts with the same four lines

```ts
"use server";
const supabase = await createClient();          // caller's session — never service role
const { user, workspaceId } = await requireWorkspace(supabase);  // throws → error.tsx
```

`requireWorkspace` is the same resolution `/api/v1`'s middleware does today.
Plan DD-4 is the reason this is not optional and not inherited from the page.

### The pending-state shape

React Query gave every one of these buttons `isPending`. `useTransition` is the
replacement, and it is the second-most-likely thing to be skipped after error
handling:

```tsx
const [pending, start] = useTransition();
start(async () => {
  const r = await createTeamAction(input);
  if (!r.ok) { setError(r.error); return; }
  await queryClient.invalidateQueries({ queryKey: ["teams"] });
});
```

A converted button that no longer disables itself while saving is a regression,
and the verification task checks for it explicitly.

## Traps that apply to every task in this phase

**`hooks.ts` is shared by every task here.** 2310 lines, and each task deletes
from it. This is why every task below is `[C]` and not `[P]` — the tags are not
a suggestion, and two agents in this file at once will conflict on nearly every
change.

**Delete the hook only after its last consumer is gone.** Some hooks are used by
two files in different clusters (`useCreateRun` by both `work-launcher.tsx` and
`runs.tsx`). Grep before deleting; a red build is cheap but repeated is
annoying.

**Do not "improve" anything.** Same validation, same message, same redirect,
same optimistic behaviour. The plan's Scope boundaries make a behaviour change a
defect. If a genuine bug is noticed while converting, file it in
[`../../bug/`](../../bug/README.md) and leave the behaviour alone.

**Server Actions serialize their arguments.** A `File`, a `Date`, or a class
instance crossing the boundary does not arrive as itself. The image upload in
`T-WA-08` (`profile-form.tsx`, `workspace-form.tsx`) is the one place this
actually bites — `FormData` is the supported carrier, not a `File` in an object.

## Tasks

Run order and concurrency live in [`../MasterTaskQueue.md`](../MasterTaskQueue.md).

| Task | Tag | Serves | Depends on | Status |
|---|---|---|---|---|
| [T-WA-01 — the convention, and `teams` as the worked example](T-WA-01-convention-and-teams.md) | `[S]` | foundational — unblocks every task below | — | not started |
| [T-WA-02 — projects](T-WA-02-projects.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-03 — agents](T-WA-03-agents.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-04 — tasks, goals, attention](T-WA-04-tasks-goals-attention.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-05 — skills](T-WA-05-skills.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-06 — runs, schedule, pipelines](T-WA-06-runs-schedule-pipelines.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-07 — chat, messages](T-WA-07-chat-messages.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-08 — settings, profile, workspace, machines](T-WA-08-settings-profile-workspace-machines.md) | `[C]` | foundational | T-WA-01 | not started |
| [T-WA-09 — verification](T-WA-09-verification.md) | `[S]` | foundational | T-WA-01–08 | not started |

`T-WA-01` is `[S]` and gates the phase: it authors `action-result.ts` and the
worked example every other task copies. Everything between is `[C]` — genuinely
independent in its own page files, genuinely conflicting in `hooks.ts`.

## Definition of done

- No client component in `apps/web` calls a mutation hook that POSTs to
  `/api/v1`, except the stub-backed ones the plan's DD-6 excludes.
- `hooks.ts` contains queries and the excluded mutations, nothing else.
- Every converted button does exactly what it did before, proved by
  `T-WA-09`'s rendered walk, not by a typecheck.
