# BUG-2026-08-24-project-provision-always-400s

**Status:** 🟢 resolved 2026-08-24
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

## Resolution — 2026-08-24

**Fixed.** `apps/web/src/lib/api/handlers/projects.ts`'s `POST /projects/provision`
handler now mirrors the sibling `POST /projects` handler's already-proven
fix: strip every client-only field before the insert (`mode`, `rootDir` /
`root_dir`, `gitUrl` / `git_url`, `gitInit` / `git_init` — one more found
while fixing than the Investigation section's original two: `gitUrl` has the
exact same problem for the "Import from GitHub" mode, sent as the client's
camelCase name with no `git_remote`-mapped column to land in), and derive a
`slug` from `name` with a collision retry, matching
[`BUG-2026-08-22-team-create-500-missing-slug`](BUG-2026-08-22-team-create-500-missing-slug.md)'s
pattern exactly.

**Scope check before writing the fix, not after.** `packages/shared/src/schemas/project.ts`'s
own doc comment says each creation mode is supposed to "map to a filesystem
action before the project row is inserted" — mkdir, validate, or clone — and
`packages/core/src/projects/provision.ts` is real daemon-side code that does
exactly that. The cloud handler this bug lives in does none of it, by
design: `projects` is identity-only (see the table's own doc comment in
`schema.ts`), the per-machine path lives in `runtime_projects`, and a
`runtime_projects` row needs a live paired `runtimeId` to bind to — which a
fresh workspace, or one with no paired machine, genuinely does not have.
Building daemon dispatch + a binding-creation flow here would have been
inventing a feature nobody asked for to fix a 400; the honest scope of this
bug is "the identity-only insert should work," and it does now. What the
dialog does *not* yet do — actually create the directory / clone the repo
via a paired machine — is real, but it is the same category of limitation as
the six already-accepted host-local gaps this plan's `T-VR-06` verified,
not a new one this fix should absorb.

**Verified with a second, independent live pass** — a fresh disposable
account (not the one that found the bug), on the same feature-branch
preview: a direct `fetch()` to `/api/v1/projects/provision` returned **200**
with a generated slug, and the actual "New project" dialog — fill name, fill
directory, click Create — closed successfully and the new project appeared
in the real list, no console errors. Cleaned up after (1 workspace, 1
profile, 1 auth user removed, cascading both test projects with it).

**Tests added**, not just live-checked: `apps/web/src/lib/api/projects-routes.test.ts`,
5 cases against a fake insert chain — a typical scratch-mode payload
succeeds, none of the six stripped field names reach the insert while a real
column (`isSandbox`) survives, the slug derives from `name`, a `23505`
collision retries and succeeds, and an explicit client-sent `slug` is
honored. `pnpm typecheck` and `pnpm test` both green, 7/7 and 5/5 packages.
