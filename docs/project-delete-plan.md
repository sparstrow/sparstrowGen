# Project Delete — Trash / Restore / Permanent Delete

> **Status: DRAFT (design captured 2026-07-08) — NOT yet reviewed or approved.**
> Captured from a design conversation while mid-drive-move; build this from the D:
> checkout. Good `/autoplan` candidate (schema change + destructive cascade + new UI
> surface), or build directly with the locked defaults below.

## Motivation

There is no way to delete a project from the UI today, and the backend delete is a
one-shot hard delete. The owner wants a **safe, reversible** delete: mistakes shouldn't
vaporize a project's folder, memory, or history. The answer is a two-stage trash model
with a type-the-name guardrail on the irreversible step.

## The model (two stages)

```
  ACTIVE PROJECT
      │  "Delete"  (reversible — light confirm)
      ▼
  DELETED PROJECTS  ← on-disk folder MOVED here; project hidden from active list;
      │                memory + run/task/message history KEPT intact for restore
      │
      ├── "Restore"  ──► back to ACTIVE (folder moved back to original rootDir,
      │                   cron/graph re-enabled)
      │
      ▼  "Delete permanently"  (irreversible — TYPE THE PROJECT NAME to confirm)
  GONE  ← moved folder deleted, project memory deleted, run/task/message history
          deleted, DB row + all cascades removed. Nothing recoverable.
```

- **Stage 1 — Delete (soft):** move the project's on-disk folder into a "Deleted
  projects" area, mark the project deleted (hidden from the active Projects list but
  listed in a Deleted Projects view), stop its cron/briefings and graph-engine child.
  **Keep** its memory + history so Restore actually restores everything.
- **Stage 2 — Delete permanently (from the Deleted Projects view):** remove it all —
  the trashed folder, project memory (vault notes + DB rows), run/task/message history,
  and the project record with its cascades. **Gated behind typing the project's exact
  name** (this is the guardrail the owner asked for; it lives on the irreversible step).
- **Restore:** move the folder back to its original `rootDir`, un-delete the row,
  re-enable cron/graph.

## Locked decisions (from the owner)

1. **Two-stage trash, not a single hard delete.** Delete → recoverable trash; a second
   explicit delete from trash → permanent.
2. **Permanent delete removes everything named:** the on-disk folder (from trash),
   project memory, and run/task/message history.
3. **The type-the-project-name guardrail is on the permanent delete** (the irreversible
   action). Soft-delete is reversible, so it gets a normal confirm.

## Open decisions (resolve at plan/build time)

1. **Where does the "Deleted projects" folder live?** Proposed default:
   `<dataDir>/deleted-projects/<slug>-<deletedAtEpoch>/` (survives restarts, findable,
   inside the app's own data dir). Alternative: a config-overridable `deletedProjectsDir`
   (`SPARSTROW_DELETED_PROJECTS_DIR`) mirroring the existing `SPARSTROW_*` path convention.
2. **Bind vs scratch — the sharp one.** Projects are created scratch / bind / clone
   (`projectCreateModeSchema`). Factory-created folders (scratch/clone) are safe to move
   to trash. A **bind** project points at a folder the owner already owned elsewhere —
   moving *that* into a trash folder would be surprising/destructive. **Proposed rule:**
   only move factory-created folders; for bind projects, soft-delete just unregisters +
   hides and leaves the on-disk folder untouched (record its path for restore). Needs a
   way to know the origin mode — add a `created_mode` column, or infer.
3. **Restore when the original `rootDir` is now occupied** (something else lives there).
   Options: refuse + prompt for a new path; restore alongside with a suffix; ask.
4. **Do soft-deleted projects' runs/tasks/messages disappear from their global lists?**
   Likely yes (filter them out of Runs/Task Board while trashed), restored on Restore.

## Current state (grounded in code, D: checkout)

- **`DELETE /projects/:id`** already exists (`packages/core/src/api/routes/projects.ts:166`)
  but is a **hard delete**: `deleteCronJobsForProject(id)` → `onProjectDeleted(id)` (stops
  graph engine child + removes the per-project store) → `db.delete(projects)`. No UI calls it.
- **Auto-cascades on the projects row** (FK `onDelete: "cascade"`, `schema.ts`):
  `project_directives` (:108), `team_projects` (:434), `agent_instances` (:466).
- **NOT cascaded — survives a row delete (orphaned by design), so these are what
  "delete the memory + history" must handle explicitly:**
  - `memory_notes` — scoped by `project_slug` (:325), **no FK**. Plus `memory_links` /
    `memory_contradictions` referencing those notes, and the on-disk vault notes under
    `<vault>/projects/<slug>/`.
  - `runs`, `tasks`, `messages`, `goals` — bare `project_id`, no FK.
  - `cron_jobs` — no FK (handled manually today).
- **No archived/deleted flag exists** on `projects` (only `is_sandbox`). Soft-delete
  needs a new column.

## Proposed implementation surface

- **Schema (new migration):** `projects.deleted_at` (nullable) + `projects.trashed_path`
  (where the folder was moved) + `projects.original_root_dir` (for restore) + probably
  `projects.created_mode` (scratch/bind/clone) if not already inferable. `deleted_at IS
  NULL` = active.
- **Backend:**
  - Change `DELETE /projects/:id` to **soft-delete** (set `deleted_at`, move folder to
    trash per the bind/scratch rule, stop cron + graph child, keep memory/history).
  - `POST /projects/:id/restore` — reverse it.
  - `DELETE /projects/:id/permanent` — the hard cascade: delete trashed folder, project
    memory (vault `projects/<slug>/` + `memory_notes`/links/contradictions by slug),
    runs/tasks/messages/goals by project, then the row (+ existing FK cascades). Requires
    a confirmation payload echoing the exact project name; reject on mismatch.
  - `GET /projects?deleted=true` (or a dedicated list) for the Deleted Projects view.
  - Filter `deleted_at IS NULL` everywhere active projects are listed/resolved.
- **UI:**
  - Delete button on the project detail page (and/or Projects list row) → reversible
    confirm → soft-delete.
  - A **Deleted Projects** view (section on Projects page or a sub-route) listing trashed
    projects with **Restore** and **Delete permanently**.
  - Permanent-delete dialog: lists exactly what will be destroyed (folder path, N memory
    notes, N runs/tasks/messages), with a text field that must match the project name
    before the button enables.
- **Config:** `deletedProjectsDir` (default `<dataDir>/deleted-projects`), env override.

## Guardrails / data-safety
- Type-the-exact-name to enable permanent delete (server-verified, not just client).
- Soft-delete is fully reversible; the scary cascade only runs from the trash view.
- Bind-project folders are never moved/deleted unless explicitly opted in (avoids
  trashing a folder the owner owns outside the factory).
- Folder move/delete is best-effort and logged; a locked/failed folder op must not leave
  the DB in a half state (decide: move folder first then flip `deleted_at`, or vice-versa
  with reconcile).

## NOT in scope (yet)
- Auto-purge of trash after N days (could be a later cron, like the dream cycle).
- Bulk delete / multi-select.
- Undo of a *permanent* delete (by definition irreversible).

## Next step
Reopen Claude Code from `D:\Sparstrow\Sparstrowgen`, then either run `/autoplan` on this
doc to lock the open decisions and produce the task list, or say "build it" to implement
directly with the locked defaults above (trash factory folders only; bind = unregister;
guardrail on permanent delete; keep-everything-for-restore).
