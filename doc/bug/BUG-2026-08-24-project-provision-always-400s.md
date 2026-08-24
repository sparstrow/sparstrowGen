# BUG-2026-08-24-project-provision-always-400s

**Status:** 🔴 open
**Reported by:** agent — found live on the feature branch's Vercel preview
while running `T-VR-06`'s browser verification pass
**Reported:** 2026-08-24

## Symptom

The "New project" dialog's **every** creation path — Start from scratch, Use
existing folder, and (by the same code path) Import from GitHub — fails
silently from the user's point of view: the dialog just sits there after
clicking "Create project", with no toast, no inline error, no console log.
Nothing is created; `/projects` still shows "No projects yet" after the
click.

## Reproduction

1. Sign in, navigate to `/projects`, click "New project"
2. Fill Name (`VR Verification Project`), leave mode on "Start from scratch",
   fill a Root directory, click "Create project"
3. Dialog stays open, no error shown anywhere in the UI
4. Network tab: `POST /api/v1/projects/provision` → **400**, response body
   `{"error":"Could not find the 'git_init' column of 'projects' in the schema cache"}`
5. Confirmed via direct `fetch()` in the page console (bypassing the form)
   that this reproduces on the minimal payload the client actually sends:
   `{name, description, mode, rootDir, gitInit, isSandbox}` → same 400.
6. Stripping `gitInit` and `mode` from the payload changes the error to
   `500 Internal Server Error` — a **second**, previously-fixed-elsewhere bug
   resurfacing in this one route (see Investigation).

100% reproducible, not intermittent.

## Investigation

`apps/web/src/lib/api/handlers/projects.ts`'s `POST /projects/provision`
handler (line 144) spreads the raw client body straight into the insert:

```ts
const payload = {
  ...body,
  workspace_id: workspaceId,
  id: body.id || generateId("prj_")
};
delete payload.rootDir;
delete payload.root_dir;
```

Two client-only fields the "New project" dialog sends —
`mode` (`"scratch" | "existing" | "github"`, which picker tab was used) and
`gitInit` (whether to `git init` the new folder) — are **not** real columns
on `projects` (`packages/shared/src/db/schema.ts:425`, confirmed against the
live schema via the 400's own error text) and are never stripped, so
PostgREST rejects the insert outright before anything is written.

Stripping both by hand (tested via direct `fetch()`, not applied to the
route) surfaces a **second, distinct** bug underneath: `500 Internal Server
Error`. `projects.slug` is `NOT NULL` with no DB default — the exact
condition [`BUG-2026-08-22-team-create-500-missing-slug`](BUG-2026-08-22-team-create-500-missing-slug.md)
fixed for teams, projects, and agents. That fix landed on the **sibling**
`POST /projects` handler ten lines up in the same file (line 25 — it derives
a slug from `name` with a collision retry) but this second `/provision`
handler was never given the same treatment. It is a separate insert path
that the earlier fix's PR did not touch.

**Confirmed unrelated to `T-VR-06`'s own work.** Both `projects.tsx` (the
dialog) and `handlers/projects.ts` (the route) predate this phase's file
moves and were carried over unchanged; this is a pre-existing defect this
verification pass happened to exercise, not a regression from moving files.

**Not yet checked:** whether "Use existing folder" and "Import from GitHub"
send the same `mode`/`gitInit` shape (both funnel through the same
`provision` call in `projects.tsx:173`, so almost certainly yes, but not
independently reproduced here).

## Impact

**Every path to creating a project is broken** on this environment right
now — not a degraded case, the primary path. A fresh workspace (which is
what every new signup gets) cannot create its first project at all, with
zero feedback to the user about why. This is more severe than the two prior
`git_init`-adjacent bugs because it is not "one field wrong," it is "the
create action is a no-op."

Whether this is scoped in `staging`'s Supabase project too, or specific to
this preview's schema state, was not checked — the schema definition itself
(`packages/shared/src/db/schema.ts`) has no `git_init`/`mode` column defined
anywhere, so this should reproduce identically on any environment running
current code.

## Resolution

<!-- Not fixed here — see the note below. -->

Deliberately not fixed as part of `T-VR-06`, per that task's own Traps
section ("do not fix what this finds, silently") and its Status line
("nothing else should be landing while it runs"). Needs a task in
`doc/tasks/` before anyone picks it up: strip `mode`/`gitInit` (and confirm
no other client-only fields leak the same way) plus give `/provision` the
same slug-generation fix `/projects` already has.
