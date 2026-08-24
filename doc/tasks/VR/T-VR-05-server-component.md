# T-VR-05 — one worked Server Component

| | |
|---|---|
| **Tag** | `[S]` — one or two files, and the next task grades the result |
| **Serves** | foundational — `D-25`'s in-tree example, so the other 21 pages have a pattern to copy |
| **Depends on** | T-VR-04 |
| **Blocks** | T-VR-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Convert one page — two at the absolute most — from a client component fetching
through React Query to the Server Component pattern `apps/web/CLAUDE.md`
mandates for new surfaces, so the pattern exists in this repo against a real
page rather than only in prose.

## Decisions already made

**One page, read-only, no mutations.** Plan decision 3 sets two as the ceiling
and warns that more means it has escaped decision 2. A page with writes drags
in Server Actions and `revalidatePath` and stops being a clean reference for
the simplest case.

**The candidate is a list page with no create/edit dialog.** Pick at
implementation time from what T-VR-03 actually left, and record which and why
in Result. `machines`, `runs` and `imports` are the likeliest — `agents`,
`projects` and `teams` all carry create dialogs.

**Reads go straight to Supabase, not through `/api/v1`.** That is the whole
point of the exercise: one hop instead of three. A Server Component that
`fetch`es our own route handler has the pattern's shape and none of its
benefit.

**The interactive part becomes a client island, not the whole page.** If the
conversion ends with `"use client"` at the top of a file that is 90% of the
page, it has not converted anything.

## Checklist

- [ ] Pick the page; record the choice and the reason in Result
- [ ] `page.tsx` becomes a Server Component: auth check and query there,
      against Supabase directly
- [ ] Extract the interactive parts into a `*-client.tsx` island, as small as
      it can honestly be
- [ ] Add a `loading.tsx` shaped like the real content — a thing the client
      pattern could not do usefully, and therefore part of the demonstration
- [ ] Confirm the page renders with data in the initial HTML, not a skeleton —
      view source, or disable JavaScript
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green

## Traps

**RLS, not the service role.** `AGENTS.md` §4 is explicit: server-side reads go
through supabase-js with the caller's session. A Server Component reaching for
`SUPABASE_SERVICE_ROLE_KEY` because it is "server-side anyway" bypasses every
policy and is the single most dangerous mistake available in this task.

**The workspace still has to be resolved.** `/api/v1`'s catch-all did that on
every request. A Server Component querying directly must do it too, or it will
read across workspaces — reuse `getActiveWorkspaceId` rather than inlining a
second version.

**Do not delete the page's `/api/v1` handler.** Other things may call it, and
`D-25` says the handler layer thins rather than disappears. Removing endpoints
is not this task.

**Do not convert a second page "while you are here".** If the first goes
smoothly, that is the signal to stop, not to continue.

## Result

<!-- Filled in when the task lands. -->
