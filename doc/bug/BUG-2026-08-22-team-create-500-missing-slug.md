# BUG-2026-08-22-team-create-500-missing-slug

**Status:** 🟢 resolved
**Reported by:** agent — found during T-M11-05 (M11 gap reconciliation), clicking "New team" on `/teams` while doing the M7-routes click-through pass against staging
**Reported:** 2026-08-22

## Symptom

On `/teams`, filling in the "New team" dialog (Name + Description) and
clicking **Create team** fails every time with a generic dialog error
reading **"Internal Server Error"**. No team is created.

Checking further: the exact same shape of failure exists for **creating a
project** (`/projects`, "New project") and **creating an agent**
(`/agents`, "New agent") — all three are completely broken on staging right
now, not just teams.

## Reproduction

1. Sign in to `staging.sparstrow.com`.
2. `/teams` → New team → fill Name → Create team. **Observed:** dialog shows
   "Internal Server Error"; network tab shows `POST /api/v1/teams` → `500
   {"error":"Internal Server Error"}`.
3. Same result reproduced directly against the API for all three resources
   (bypassing the UI form entirely, to rule out a client-side issue):
   - `POST /api/v1/teams` with `{"name": "...", "description": "..."}` → 500
   - `POST /api/v1/projects` with `{"name": "...", "description": "..."}` → 500
   - `POST /api/v1/agents` with `{"name": "...", "provider": "...", "model": "..."}` → 500

## Investigation

`packages/shared/src/db/schema.ts` defines `slug` as `text("slug").notNull()`
(no default) on all three tables — `teams` (line 480), `projects` (line
430), and `agents` (line 281) — each with a `(workspace_id, slug)` unique
index.

None of the three POST handlers
(`apps/web/src/lib/api/handlers/{teams,projects,agents}.ts`) ever generated
a `slug` — each just spread the request body plus `workspace_id` and a
generated `id`:

```ts
const payload = { ...body, workspace_id: workspaceId, id: body.id || generateId("tem_") };
```

And the client never sends one either — `packages/ui/src/api/hooks.ts`'s
create-team/create-project/create-agent mutations only send name/description
(or provider/model, for agents). So every INSERT into any of the three
tables violated the `NOT NULL` constraint on `slug`, Postgres rejected it,
and the shared router's generic error handler turned that into an opaque
500 — the router deliberately doesn't leak internal error detail to the
client, which is correct for a real constraint violation but meant the
actual cause (`slug` missing) was invisible from the browser.

`workspaces.slug` (also `not null unique`) does **not** have this bug:
`apps/web/src/lib/api/handlers/workspace.ts` already has a `slugify()` +
`withCollisionSuffix()` pair used by workspace name edits, because a
workspace's slug is set once, deliberately, per plan decision 8. That
existing, tested pattern was reused for the fix below rather than inventing
a second one.

## Impact

**Every fresh workspace on staging could create zero teams, zero projects,
and zero agents through the product UI**, silently, with a message that
names neither the cause nor a next step. This blocks essentially all of
this app's day-to-day usage the moment someone finishes onboarding and
tries to actually set anything up — a materially worse finding than
anything else this phase surfaced. Not specific to the M11 disposable
account: the constraint is unconditional, so this affected the owner's own
account and every account on staging equally, for as long as the bug
existed.

## Resolution

Fixed directly in this pass (small, mechanical, identical shape across all
three files — per the M11 phase README's explicit allowance for
small/obvious fixes found during verification):

- `apps/web/src/lib/api/handlers/teams.ts`
- `apps/web/src/lib/api/handlers/projects.ts`
- `apps/web/src/lib/api/handlers/agents.ts`

Each now derives a slug via the existing `slugify()`
(`apps/web/src/lib/api/handlers/workspace.ts`) from `body.name` when the
caller doesn't supply one, and retries once with `withCollisionSuffix()` on
a `23505` unique-violation — the exact pattern already proven for
`workspaces.slug`.

**Verified:** `pnpm --filter web dev`, pointed at the same staging Supabase
project via the worktree's `.env.local`, then `POST /api/v1/teams`,
`/projects`, and `/agents` each with only `name` (no `slug` in the body) —
all three now return `200` with a real generated `slug` on the row, and a
second create with a colliding `name` gets a distinct suffixed slug rather
than a second 500. `pnpm -r typecheck` clean.

Not yet re-verified through the actual UI dialogs with a rendered click
(computer-use/Browser-pane constraints during this pass) — the API-level
proof is what "small and obvious, fixed in this pass" rests on; a full
click-through re-pass through `/teams`, `/projects`, `/agents` is fair
residue for whoever verifies this PR before merge.
