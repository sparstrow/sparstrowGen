# BUG-2026-08-25-project-variants-read-queries-a-table-that-does-not-exist

**Status:** 🔴 open
**Reported by:** agent — found while converting `useCreateVariant` in `T-WA-02`
**Reported:** 2026-08-25

## Symptom

`GET /projects/:id/variants` (`apps/web/src/lib/api/handlers/projects.ts`) and
its client hook `useProjectVariants` (`apps/web/src/api/hooks.ts`) query
`supabase.from("project_variants")`. No such table exists anywhere in
`packages/shared/src/db/schema.ts` or its migrations — a client variant is
actually a `projects` row with `parentProjectId` set (`idx_projects_parent`
exists specifically for this query shape). Calling this route throws a
Postgres "relation does not exist" error.

## Reproduction

1. Open a non-sandbox, non-variant project's workspace page
   (`/projects/<id>`) — `VariantsPanel` calls `useProjectVariants(projectId)`
   on mount.
2. The request 500s against `project_variants` not existing.

Not run live against a database in this task (`T-WA-02` scope is the write
side only, and this is a pre-existing read); found by reading the handler and
cross-checking `packages/shared/src/db/schema.ts` for a `project_variants`
`pgTable`, which does not exist.

## Investigation

- `packages/shared/src/db/schema.ts` defines `projects` with a self-referencing
  `parentProjectId` column and `idx_projects_parent` index — the shape that
  models "variants of project X" — and no separate `project_variants` table.
- `grep -rn "project_variants" packages/shared/` returns only the one call
  site inside the GET handler itself; nothing in migrations ever created it.
- This predates `T-WA-02`: the GET handler and the hook were both already in
  this shape before this task touched the file. The task's own new
  `createVariantAction` (`apps/web/src/app/projects/[projectId]/actions.ts`)
  correctly inserts into `projects` with `parentProjectId`, so a variant
  created going forward will never show up in this broken read.

## Impact

Anyone opening a base project's workspace page hits a failed request for its
variants list — the panel likely renders in an error/empty state instead of
showing existing variants. Reads are out of scope for `T-WA-02` (plan DD-5:
this phase converts writes only), so left as found rather than fixed here.

## Resolution

*Open. Fix belongs in whichever task next touches project reads — change
`useProjectVariants`'s query (and the `GET /projects/:id/variants` handler) to
select from `projects` filtered by `parent_project_id = :id` instead of the
nonexistent `project_variants` table.*
