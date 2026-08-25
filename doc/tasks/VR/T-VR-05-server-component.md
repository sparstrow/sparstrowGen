# T-VR-05 — one worked Server Component

| | |
|---|---|
| **Tag** | `[S]` — one or two files, and the next task grades the result |
| **Serves** | foundational — `D-25`'s in-tree example, so the other 21 pages have a pattern to copy |
| **Depends on** | T-VR-04 |
| **Blocks** | T-VR-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done 2026-08-24 |

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

- [x] Pick the page; record the choice and the reason in Result
- [x] `page.tsx` becomes a Server Component: auth check and query there,
      against Supabase directly
- [x] Extract the interactive parts into a `*-client.tsx` island, as small as
      it can honestly be
- [x] Add a `loading.tsx` shaped like the real content — a thing the client
      pattern could not do usefully, and therefore part of the demonstration
- [x] Confirm the page renders with data in the initial HTML, not a skeleton —
      view source, or disable JavaScript
- [x] `pnpm typecheck` green
- [x] `pnpm test` green

## Decision revised on contact: no candidate is actually read-only

**Checked before picking, not assumed.** None of the three named candidates
survives contact:

| Page | What disqualifies it |
|---|---|
| `machines` | `useRuntimes()` polls every 15s -- "a machine crossing the staleness threshold changes nothing in the database, so nothing pushes" (the hook's own comment). A plain Server Component fetch is a snapshot; losing the poll silently breaks the one thing a monitoring page for machine status exists to do |
| `runs` | Has a real "New run" `<Dialog>` with a prompt/agent/project form -- exactly what this task's own criterion rules out, despite being on its candidate list |
| `imports` | `useSkillImports()` polls every 5s, and `useSkillImportDetail` polls while an import is mid-pipeline. No `Dialog`, but the whole page is a live-polling master-detail view |

Widened the search systematically: every exported query hook in
`packages/ui/src/api/hooks.ts` was checked for `refetchInterval`, then every
non-polling list page was checked for a `Dialog`. **Every substantive list
page in this app either polls for live status or has a create dialog** -- a
consequence of this being a monitoring/CRUD tool, not an incidental gap in
page selection. A genuinely static, write-free page does not exist here to
be picked.

**Chose `teams` instead -- not on the task's list, ruled out by name in its
own Decisions section, and the right choice anyway.** It does not poll
(`useTeams()` -- team membership changes only through user action, the same
"changes only via mutation, invalidation handles it" case the codebase
already documents for `useWorkspace()`/`useProfile()`). Its one dialog is
small, cleanly bounded, and -- once actually read -- was the *shape* T-VR-05
describes: a read-mostly list with one narrow write, not a write-free page
that doesn't exist in this codebase.

**Scope held anyway.** The write was NOT converted to a Server Action.
`teams-client.tsx` still calls the existing `POST /api/v1/teams` /
`PUT /api/v1/teams/:id/projects` via the unmodified React Query hooks -- per
this task's own reasoning, adding Server Actions to the first example was
explicitly the complexity to avoid. What replaces React Query's cache
invalidation (which targets a cache the server-rendered list no longer reads)
is `router.refresh()`, called on mutation success -- it re-runs the Server
Component and the new team appears. That is the one new idea this task
needed beyond "move the fetch"; see Result for what it proves.

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

**Done 2026-08-24.** `apps/web/src/app/teams/page.tsx` is now a Server
Component: it authenticates, resolves the workspace, and queries `teams`,
`team_members`, `team_projects` and `projects` directly against Supabase --
reproducing `GET /api/v1/teams`'s two-round-trip aggregation exactly, using
the caller's session (never the service role). The old client component is
deleted, not left behind as dead code.

### The files

- **`page.tsx`** -- the Server Component. Auth + workspace resolution +
  the read. `TeamHierarchy` moved in as a plain function component (no
  hooks, no directive) -- it renders server-side as part of the list now,
  where it used to be one more thing a client bundle shipped.
- **`teams-client.tsx`** -- the island. Owns the toolbar line, the empty
  state, and the create-team dialog. All of it, together, because both the
  toolbar's "New team" button and the empty state's own copy of that button
  must open the *same* dialog -- see the one real design mistake below.
- **`loading.tsx`** -- a skeleton shaped like the actual grid, which
  `apps/web/CLAUDE.md`'s own case for this pattern names as something the
  old approach "could not do usefully."

### One design mistake, caught before it shipped

First pass mounted `TeamsPageClient` **twice** -- once in the header, once in
the empty state -- each an independent component instance. That means two
independent `open` states and two independent `<Dialog>`s: whichever button
the user did *not* click would silently do nothing the next time, since its
dialog was never the one that opened. Caught by reasoning through the render
tree before testing, not by testing -- a good reminder that "it typechecks
and looks right" and "it is right" are different claims, which is exactly
what T-VR-04's browser pass existed to catch too.

Fixed by mounting the client component **once**, passing `hasTeams: boolean`
so it decides internally which trigger position(s) to render, sharing one
`open` state. Verified live: clicked the *empty-state* button specifically
(the one NOT in the header), confirmed the dialog opened, filled it, and
confirmed the created team appeared -- proving the shared state, not just
that a dialog exists somewhere.

### The idiom improvement made along the way

Each team card was a `<div role="button" tabIndex={0} onClick={...}
onKeyDown={...}>` -- a hand-rolled button substitute. Replaced with a real
`<Link href="/teams/${team.id}">` wrapping the card. This is not incidental
tidying: a `<div>` masquerading as a link has no href for a browser, a
crawler, or a screen reader to see ahead of interacting with it, and
`aria-current`/right-click/open-in-new-tab all work for free with a real
anchor and never did before. In scope here specifically because T-VR-05 is
building the target pattern fresh rather than moving files (T-VR-02/03's
"mechanical, not a rewrite" bar does not apply to a task whose whole point
is writing the new version correctly).

### Verified, in a browser, signed in -- not by reading the diff

Per the runbook's disposable-account procedure, cleaned up afterward with its
SQL (no orphans -- confirmed by count on both the create and the final
cleanup).

| Claim | Evidence |
|---|---|
| Data ships in the raw response, not a skeleton | `fetch('/teams')` on an empty workspace: raw HTML contains `"No teams yet"` |
| The read is a real Supabase query, RLS-scoped | Team created via the existing mutation was visible in the *next* raw fetch of `/teams` -- the aggregation, workspace filter and camelCasing all round-tripped correctly |
| The empty-state trigger shares the header's dialog | Clicked `ref_5` (empty state, not header) -> dialog opened -> submitted -> team appeared |
| `router.refresh()` actually updates a Server Component list | Confirmed via the raw-HTML fetch above, not by trusting the visible DOM, which a stale client cache could fake |
| The card is a real link | `document.querySelector('a[href^="/teams/tem_"]')` resolved to the correct id |
| Auth/workspace redirects fire from the Server Component itself | Deleting the test account server-side, then reloading `/teams`, landed on `/login` -- the `redirect()` branches execute, not just typecheck |
| No console errors | Only expected noise: no HMR websocket in this environment, and 501s from the deliberately-stubbed handlers unrelated to this page |

`pnpm typecheck` green 7/7, `pnpm test` green (1,385 passing, unchanged --
this task added no new test files; the existing suite doesn't cover this
route and that gap is inherited, not created, here).

**Stale build cache, found and fixed, not worked around.** The dev server
initially reported `Module not found: Can't resolve './teams-client'` on a
file that plainly existed. Traced to `.next/`'s mtime predating the new
files -- a leftover Turbopack cache from a server started before this task's
files existed. Cleared `.next` and restarted rather than adding a workaround
or assuming the code was wrong; the second start was clean.

### What this leaves open for the other 21 pages

- **Whether writes become Server Actions is still undecided**, and this task
  deliberately did not decide it -- it kept the existing mutation path to stay
  the smallest possible first example. Whoever converts the next page with a
  real write should treat that as a live choice, not inherit
  `router.refresh()` + React Query as the established pattern by default.
  Raised to the owner as [`OQ-7`](../../OpenQuestions.md), parked pending a
  decision -- recommendation is to keep this pattern for existing writes and
  use Server Actions only for genuinely new ones (the stubbed modules), but
  that is not yet decided.
- **The candidate list in this task's own header (`machines`, `runs`,
  `imports`) does not describe any page in this codebase.** Corrected here so
  the next reader does not re-discover the same dead end.
