# Every write becomes a Server Action — 2026-08-24

| | |
|---|---|
| **Spec** | n/a (internal) — this changes how a write is transported, not what the owner can do. No screen gains or loses a control. |
| **Status** | Draft — WA1 next |
| **Trigger** | The owner, 2026-08-24, answering [`OQ-7`](../OpenQuestions.md) with **option A**: rewrite every existing write to the one-step way now, rather than converting opportunistically. |
| **Depends on** | [`retire-the-vite-app`](2026-08-24-retire-the-vite-app.md) — complete. `T-VR-05` is the worked read conversion this builds on. |
| **Touches** | `apps/web/src/app/**/actions.ts` (new), `apps/web/src/api/hooks.ts`, the 21 client components listed in WA1, `apps/web/src/lib/api/handlers/*.ts`, `apps/web/CLAUDE.md` |
| **Tasks** | [`doc/tasks/WA/`](../tasks/WA/README.md) |
| **Open questions** | none — `OQ-7` closed 2026-08-24 |

## Summary

Executes `OQ-7`'s answer. **87 mutation call sites across 27 files** stop
POSTing to `/api/v1` through a React Query hook and become Server Actions
invoked directly from their client islands. `apps/web/CLAUDE.md`'s write rule
has said this since the Next.js migration; until now nothing was converging on
it, and `T-VR-05` had just established a precedent pointing the other way.

## The owner chose the expensive option deliberately, and that is recorded here on purpose

`OQ-7` recommended **option C** — convert new writes, leave working ones alone
until something else touches them — and scored it 8/10 against A's 4/10. The
owner chose **A**. A's stated cost was put to them before they chose it: about
twenty pages of rewrite producing no change any user will ever see, each one a
new place a mutation that worked yesterday can break today.

This paragraph exists so that a future reader finding a large, user-invisible
diff does not reconstruct it as scope that escaped. It did not escape; it was
bought. **Do not narrow this plan back to C in a task**, and do not treat a
still-unconverted `useMutation` as evidence that C was the real policy.

## What isn't obvious

### A Server Action does not, by itself, make anything one step

This is the load-bearing fact the option description did not surface, and the
whole shape of this plan follows from it.

`revalidatePath` invalidates Next.js's route cache. It tells a **Server
Component** to re-render with fresh data. It has no effect whatsoever on a
React Query cache living in the browser — and **21 of the 27 files here are
client components that read via React Query.** Convert one of their writes to a
Server Action and nothing appears on screen afterwards unless something else
still invalidates that query.

So "rewrite the write" splits into two genuinely different outcomes:

| | Write is a Server Action | Read is server-side | Result on screen |
|---|---|---|---|
| Today | no | no | POST, then refetch — two round trips |
| **After WA1** | **yes** | no | Action, then `invalidateQueries` — still two round trips |
| After WA1 + WA2 | yes | yes | Action + `revalidatePath` — **one round trip** |

**WA1 delivers the doctrine's letter. WA1 + WA2 delivers what the doctrine is
for.** WA1 is the owner's answer executed literally and is committed. WA2 is
the read conversion — [`D-25`](../Deferred.md) — which WA1 makes worth
finishing and which is scheduled here rather than left parked, because a plan
that stops at WA1 has spent A's whole cost and collected half its benefit.

WA2 is separable. If the owner wants to stop after WA1, the app is correct,
consistent, and on one write pattern — just not yet faster. That is a real
stopping point, and it is why these are two phases rather than one.

### `hooks.ts` is 2310 lines and every phase in this repo has collided with it

`apps/web/src/api/hooks.ts` holds 98 mutation hooks and the queries beside
them. Every task in WA1 deletes from it. That makes the whole phase `[C]`
against itself — this is not a file two agents can edit at once, and the queue
reflects that.

The queries stay. Only mutation hooks are removed, and only once their last
consumer is converted — a hook deleted while a second page still imports it is
a red build, which is the cheapest possible failure here and still worth not
having twice a day.

### Six of the 27 files have no `/api/v1` write to remove

`terminals.tsx`, `directory-picker-dialog.tsx`, `blocked-project-actions.tsx`,
`manager-chat-panel.tsx`, and parts of `memory.tsx` and `settings.tsx` call
hooks whose handlers are **501 stubs** in
[`stubs.ts`](../../apps/web/src/lib/api/handlers/stubs.ts). Converting them
means writing a Server Action that calls a machine that cannot be reached yet.

These are **out of WA1's scope** and are named in Scope boundaries. They are
not "already done"; they are work belonging to
[`reaching-my-machine-from-the-browser`](2026-08-24-reaching-my-machine-from-the-browser.md)
and the access model, which build the surfaces those buttons need. Converting a
dead button's transport is motion, not progress.

## Work breakdown

### Foundational — blocks all stories

There are no user stories: this plan has no spec because it changes no
behaviour. Everything below is foundational by construction, so the table
records what each unit unblocks instead of what it demos.

| Work | Why no story owns it |
|---|---|
| A worked Server Action example plus the shared result/error convention | Every later task copies it; on its own it changes one button |
| 21 per-page write conversions (WA1) | The owner clicks the same buttons and sees the same results |
| Deleting the dead `/api/v1` write handlers and mutation hooks | Removing code nobody can see |
| The read conversions that make those writes one-step (WA2) | Faster first paint; no new control anywhere |

## Decisions

### DD-1 — WA1 converts the write's transport; the read's refresh mechanism follows it, per page

A converted write on an unconverted page keeps a `queryClient.invalidateQueries()`
call after the action returns. This is deliberate and is **not** the two-step
pattern `OQ-7` rejected: what option B preserved was POSTing to `/api/v1`; what
this preserves is a cache invalidation, which is a client-side consequence of
the read not having moved yet. When that page's read converts in WA2, the
invalidation is deleted and `revalidatePath` inside the action replaces it.

Rejected: converting read and write together as one task per page. It is the
better end state and it is WA2, but bundling them makes every WA1 task a full
page rewrite, which roughly triples the phase and puts the owner's actual
answer behind a much larger body of work than they agreed to.

### DD-2 — Actions live in `app/<route>/actions.ts`, colocated, never in a shared barrel

One `actions.ts` beside each `page.tsx`, exporting only that route's writes,
with `"use server"` at the top of the file. A shared `lib/actions.ts` would
recreate `hooks.ts` — the 2310-line file this plan is partly an escape from —
and would defeat the per-route tree-shaking that makes colocation worth having.

### DD-3 — Every action returns a discriminated result; none of them throws for an expected failure

```ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };
```

React Query's `onError` was doing real work on these pages — 400s with field
messages, the 501s from stubs, the "machine is offline" refusals. **An uncaught
throw in a Server Action reaches the client as a generic redacted digest in
production**, which would silently destroy every one of those messages. This
convention is what stops the conversion quietly degrading error handling across
21 pages, and it is the single most likely thing to be got wrong by reflex.

Unexpected failures still throw and still reach `error.tsx`. The distinction is
expected-and-explainable versus a bug.

### DD-4 — Authorization is re-checked inside every action, not inherited from the page

A Server Action is a **public HTTP endpoint with an unguessable name.** It is
not protected by the fact that the page rendering it did an auth check. Every
action re-resolves the session and the workspace through the same helpers the
`/api/v1` handler it replaces used, and every one keeps going through
supabase-js with the caller's session so RLS still applies — `AGENTS.md` §4's
rule about never reaching the control plane with the `postgres` role is not
relaxed by moving the call site.

This is the one place where "the handler already did this" is a dangerous
thought, so it is a decision rather than a note.

### DD-5 — A `/api/v1` write handler is deleted only when its last caller is gone

The registry stays; it thins. Daemon-facing routes, streaming routes, and every
read are untouched. A write handler is deleted in the same task that converts
its last consumer, so there is never a window where a stale handler and a live
action both accept the same write — that ambiguity is exactly how M2's defect 5
happened (`POST /goals` had a stub and a real handler, and import order decided
which won).

### DD-6 — The stub-backed writes are excluded, and excluded loudly

See "Six of the 27 files" above. `stubs.ts` keeps its 501s; those buttons get
converted by whichever plan builds the surface behind them, in the same change
that makes them work. Recorded in Scope boundaries so this reads as a boundary
rather than as an oversight.

## Phases

### WA1 — every write becomes a Server Action (foundational)

Converts 21 files. Ends when no client component in `apps/web` calls a mutation
hook that POSTs to `/api/v1`, and `hooks.ts` holds queries plus only the
excluded stub-backed mutations.

Depends on nothing. Blocks WA2.

Tasks are grouped by domain cluster rather than by file, so each is one
coherent set of buttons with one set of handlers to delete behind it:

| Task | Files | Sites |
|---|---|---|
| the convention, and one worked example (`teams`) | `teams-client.tsx`, `team-detail.tsx` | 9 |
| projects | `project-detail.tsx`, `projects.tsx` | 13 |
| agents | `agents.tsx`, `agent-create.tsx` | 9 |
| tasks, goals, attention | `tasks.tsx`, `goal-detail.tsx`, `attention-queue.tsx`, `work-launcher.tsx` | 12 |
| skills | `skills.tsx`, `skill-detail.tsx` | 7 |
| runs, schedule, pipelines | `runs.tsx`, `run-detail.tsx`, `schedule.tsx`, `pipelines.tsx` | 10 |
| chat, messages | `chat.tsx`, `messages.tsx` | 6 |
| settings, profile, workspace, machines | `settings.tsx`, `profile-form.tsx`, `workspace-form.tsx`, `machines.tsx` | 12 |
| verification | — | — |

`teams` is first because `T-VR-05` already converted its read, so it is the one
page where WA1 alone produces the finished one-round-trip result — which makes
it the only honest worked example for the rest to copy.

### WA2 — the reads that make those writes one-step (foundational)

Executes [`D-25`](../Deferred.md) for the 21 pages WA1 leaves with a
client-side read. Each page's `invalidateQueries` bridge is deleted and
`revalidatePath` in its action takes over.

Depends on WA1. **Not decomposed yet, deliberately** — the same precedent M14
and M15 followed behind M13: this phase's tasks should be written against what
WA1's conversions actually turn out to look like, not against this outline. It
is also the natural place for the owner to stop, if they decide A's benefit has
been collected.

## Scope boundaries

- **Reads are not converted in WA1.** That is WA2, and it is
  [`D-25`](../Deferred.md), whose per-route opportunistic unpark condition this
  plan supersedes **for writes only**.
- **Stub-backed writes are not converted at all here** (DD-6): terminals, the
  directory picker, blocked-project actions, team manager chat, memory rescan,
  provider settings, local skill import. They belong to
  [`reaching-my-machine-from-the-browser`](2026-08-24-reaching-my-machine-from-the-browser.md)
  and [`I-11`](../Ideas.md).
- **`/api/v1` is not deleted.** Reads, daemon-facing routes and streaming stay,
  per D-25's own warning that reading it as "delete the handler registry" is a
  misreading.
- **No behaviour changes.** If a converted button does something different from
  what it did before — different validation, a different message, a different
  redirect — that is a defect, not an improvement, and the verification task
  grades it that way.

## Verification

This plan has no spec and therefore no `SC-nnn`. The bar is that **nothing
changed**, which is harder to demonstrate than a new feature and is graded
accordingly.

| Criterion | How it gets checked |
|---|---|
| Every converted button still works | `frontend-verify` walk of all 21 files' buttons against the branch's own Vercel preview, with a real signed-in session |
| No write still reaches `/api/v1` from a browser | `read_network_requests` across that walk shows no `POST`/`PATCH`/`DELETE` to `/api/v1` except the excluded stub-backed ones |
| Error messages survived (DD-3) | Force a 400 with a field error and a 501 stub; both render the same text they render today |
| Actions are authorized independently (DD-4) | Invoke one action's endpoint without a session and confirm it refuses, rather than relying on the page's guard |
| Nothing else regressed | `pnpm typecheck` and `pnpm test` green across the workspace |

**Named early, per the plan template:** the "no write reaches `/api/v1`" check
needs a rendered browser pass with real credentials, which this repo can only
do against a deployed preview — the same constraint behind `G-22` and `G-31`.
If that pass cannot be completed, it becomes a `KnownGaps.md` entry written in
the same change, not a ticked box resting on a green typecheck.

## Result

*Filled in as the phases land.*
