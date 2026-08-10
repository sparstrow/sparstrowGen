# T-M2-04 — Handlers: identity & configuration

| | |
|---|---|
| **Tag** | `[P]` parallel with T-M2-05, T-M2-06 |
| **Depends on** | T-M2-03 |
| **Blocks** | T-M2-08 |
| **Phase spec** | [M2/README.md](README.md) |
| **Status** | queued |

## Objective

CRUD for the things that describe the workspace rather than the work happening
in it: agents, skills, teams, projects.

Disjoint from T-M2-05 and T-M2-06 — different handler modules, different tables.
Three workers can run these three tasks simultaneously.

## Endpoints

```
GET/POST        /agents
GET/PATCH/DEL   /agents/:id
GET/PUT         /agents/:id/skills
POST            /agents/:id/promote
POST            /agents/:id/discard
GET             /agents/imports · /agents/imports/:id

GET/POST        /skills
GET/PATCH/DEL   /skills/:id
GET/PUT         /skills/assignments

GET/POST        /teams
GET/PATCH/DEL   /teams/:id
GET/POST        /teams/:id/members
PATCH/DEL       /teams/:id/members/:id
GET/PUT         /teams/:id/projects

GET/POST        /projects
GET/PATCH/DEL   /projects/:id
POST            /projects/provision
GET             /projects/:id/variants
GET/POST        /projects/:id/directives
PATCH/DEL       /projects/:id/directives/:id
```

## Checklist

- [ ] `apps/web/src/lib/api/handlers/agents.ts`
- [ ] `apps/web/src/lib/api/handlers/skills.ts`
- [ ] `apps/web/src/lib/api/handlers/teams.ts`
- [ ] `apps/web/src/lib/api/handlers/projects.ts`
- [ ] Register all four in `handlers/index.ts`
- [ ] Every insert stamps `workspace_id` server-side
- [ ] Every insert generates its own `id` when the client didn't send one, using
      the same prefix convention as core (`agt_`, `prj_`, …)
- [ ] `/agents/:id/skills` and `/skills/assignments` write `agent_skills` as a
      set operation — delete-then-insert inside one request, not per-row diffing
- [ ] `/projects/provision` creates the project row only. **It does not touch a
      filesystem** — binding a project to a machine is `runtime_projects`, which
      arrives in M4. Return the created row.
- [ ] `/agents/:id/promote` and `/discard` set `status` (`active` /
      `discarded`) per the P9 quarantine lifecycle; they do not delete rows
- [ ] Response shapes match the zod types in `@sparstrow/shared` that the hooks
      already expect (`Agent`, `Skill`, `Team`, `TeamDetail`, `Project`, …)

## Note on `projects.root_dir`

It no longer exists. The old cloud schema had a single global `root_dir`, which
cannot be correct across machines. Per-machine paths live in `runtime_projects`.
If a hook expects `rootDir` on a project, return `null` — M7 updates the UI.

## Verification

- [ ] `pnpm --filter web typecheck` passes
- [ ] `/agents`, `/skills`, `/teams`, `/projects` pages load with real or empty data
- [ ] Creating an agent through the UI persists and reappears after reload
- [ ] Assigning a skill to an agent round-trips correctly
- [ ] A row created by user A in workspace A is invisible to user B in workspace B
