# BUG-2026-08-22-teams-page-crashes-with-real-data

**Status:** 🟢 resolved
**Reported by:** agent — found during T-M11-05 (M11 gap reconciliation), clicking into `/teams` and `/teams/[teamId]` right after fixing [`BUG-2026-08-22-team-create-500-missing-slug`](BUG-2026-08-22-team-create-500-missing-slug.md), the first time a team could be created at all
**Reported:** 2026-08-22

## Symptom

With one real team in the workspace, **both** `/teams` (the list) and
`/teams/[teamId]` (the detail page — one of the five routes M7 added)
crash outright with a Next.js runtime error overlay:

```
Runtime TypeError
Cannot read properties of undefined (reading 'length')
```

`/teams`: at `packages/ui/src/routes/pages/teams.tsx:28`, inside
`TeamHierarchy({ members })` — `members.length` where `members` is
`undefined`.

`/teams/[teamId]`: at `packages/ui/src/routes/pages/team-detail.tsx:174` —
`team.members.length`, same shape.

Both pages show React's "This page couldn't load" fallback. Nothing
renders — not a degraded view, a hard crash of the whole route.

## Reproduction

1. Create any team (works once the slug bug above is fixed).
2. Visit `/teams`. **Observed:** runtime error overlay, page fails to load.
3. Visit `/teams/<the team's id>` directly. **Observed:** same shape of
   crash, different line.

This was **invisible in every prior verification pass** because it only
manifests once a real team row exists — every earlier pass hit the empty
state ("No teams yet"), which never calls `TeamHierarchy` at all. This is
the exact class of defect `AGENTS.md` names M2's browser pass for: no
API-level or unit test catches "the empty-state path was tested, the
populated path was not."

## Investigation

`packages/shared/src/schemas/team.ts` declares the contract the frontend is
built against:

```ts
export const teamIndexItemSchema = teamSchema.extend({
  memberCount: z.number().int(),
  projectCount: z.number().int(),
  members: z.array(z.object({ agentId: idSchema, agentName: z.string() })),
});

export const teamDetailSchema = teamSchema.extend({
  members: z.array(z.object({ id: idSchema, agentId: idSchema, agentName: z.string(), agentRole: z.string(), teamRole: z.string().nullable(), sort: z.number().int() })),
  projects: z.array(z.object({ id: idSchema, name: z.string(), slug: z.string() })),
});
```

Both `GET /teams` and `GET /teams/:id` in
`apps/web/src/lib/api/handlers/teams.ts` do a plain
`supabase.from("teams").select("*")` (or `.eq("id", params.id).single()`)
— the bare `teams` table, with **no join** to `team_members` or
`team_projects` and no computed `memberCount`/`projectCount`. The handlers
never implement `teamIndexItemSchema` or `teamDetailSchema` at all; they
just return the raw row, which has none of `members`, `memberCount`,
`projectCount`, or `projects`. The frontend, written against the schema
that was supposed to be the contract, assumes those fields exist
unconditionally and crashes the instant they don't.

The `GET /teams/:id/members` and `GET /teams/:id/projects` routes *do*
exist as separate endpoints in the same file and *do* join correctly — the
data the UI needs is reachable, just not through the endpoints the list and
detail pages actually call.

## Impact

**`/teams` and `/teams/[teamId]` are unusable the moment a single team
exists** — which, once `BUG-2026-08-22-team-create-500-missing-slug` is
fixed, will be almost immediately for any workspace that uses the feature
at all. This is the M7-era `/teams/[teamId]` route specifically — one of
the five detail routes that phase's own verification (`T-M7-04` §A) has
never been able to check off, and this is exactly why: "renders inside
AppShell, real data, no errors" fails on real data, not before it.

## Resolution

Fixed in `fix/teams-page-real-data`.

`apps/web/src/lib/api/handlers/teams.ts`:

- `GET /teams` now fetches the bare `teams` rows, then does two round-trips
  against `team_members` (joined to `agents(name)`) and `team_projects`,
  filtered with `.in("team_id", teamIds)` across every team in the
  workspace, and aggregates `memberCount`/`projectCount`/`members` per team
  in JS — matching `teamIndexItemSchema` exactly. A team with zero members
  and zero projects gets `memberCount: 0`, `projectCount: 0`, `members: []`
  rather than the aggregation map lookup ever coming back `undefined`.
- `GET /teams/:id` fetches the team row, then `team_members` (joined to
  `agents(name, role)`) and `team_projects` (joined to
  `projects(id, name, slug)`) filtered to that one team, and shapes
  `members`/`projects` to match `teamDetailSchema` exactly (including the
  member row's own `id`, distinct from `agentId`).
- Both reuse the same join tables `GET /teams/:id/members` and
  `GET /teams/:id/projects` already read — no new query shape invented, per
  the investigation's crib-source pointer.

`packages/ui/src/routes/pages/teams.tsx` and `team-detail.tsx` also got
defensive `?? []` / `?? 0` fallbacks on `members`/`memberCount`/
`projectCount`/`projects` — a floor against future contract drift, not the
fix itself; the schema-shaped backend change above is what actually closes
this.

**Verified:** `apps/web/src/lib/api/teams-routes.test.ts` (new) exercises
both handler bodies against a fake Supabase query builder and validates the
response with the real `teamIndexItemSchema`/`teamDetailSchema` from
`@sparstrow/shared` — not just a 200. Covers: a workspace with a populated
team and an empty team side by side (the aggregation-map-miss case that
used to crash `TeamHierarchy`), the zero-teams empty-array case, and a
detail 404 for a missing/RLS-hidden id. All 7 cases pass. `pnpm -r
typecheck` and `pnpm -r test` run clean from the worktree.

**Not verified live** against a running app / staging in this pass — the
in-session browser tooling available to this worktree is scoped to a
different agent's directory (this session runs 5 parallel bug-fix agents,
each in its own worktree, sharing one browser-preview tool bound to one of
them), so driving a real signed-in `/teams` click-through was not reachable
without touching another agent's territory. The unit-test proof above is
what this fix rests on; a real click-through against the feature branch's
Vercel preview (per `AGENTS.md` §2 rule 3) is fair residue for whoever
verifies this PR, and is exactly what T-M7-04 §A still needs to close.
