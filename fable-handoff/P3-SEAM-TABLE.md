# P3 — EH4 agent-identity seam table

> Required by ENGINEERING_PLAN §P3 item 1 (EH4): "P3's build spec MUST include an
> enumerated seam table, each seam with a decided template-or-instance binding."
> An **instance** = `(agent template, project)`, created lazily on the first run of a
> template inside a project (`agent_instances`, migration `0006`). A run with no
> project binds to the template itself (no instance).
> Verified against `main` @ `827c6d5` (post P1 #10, P2 #11), 2026-07-04.

| # | Seam | Code | Binding | Rationale / change |
|---|---|---|---|---|
| 1 | Busy-set key (one concurrent run per identity) | `run-manager.ts` `busyAgents` (`tick`/`start`/`finalize` + fail paths) | **INSTANCE** | P3-Q5 LOCKED: different projects' instances of one template run concurrently (global cap still bounds total). Key = `agentId::projectId` (empty project ⇒ template itself). |
| 2 | Run row identity | `runs.agent_id` + **new `runs.agent_instance_id`** | template + instance | `agent_id` stays the template FK (queries, UI). `agent_instance_id` stamped at spawn when the run has a project — the audit trail EH4 requires. |
| 3 | Task assignment | `tasks.assigned_agent_id` | **TEMPLATE** | Assignment names *who* (a capability), not *where*; the instance materializes at run time from `(assignee, task.project_id)`. |
| 4 | Task provenance | `tasks.created_by_agent_id` | **TEMPLATE** | Same as #3 — provenance is org-level identity. |
| 5 | Messaging | `messages.from_agent_id` / `to_agent_id` | **TEMPLATE** | Agent↔agent mail is org-level; a message to "Coder" must reach Coder regardless of project. Thread context carries `task_id` (and thus project). |
| 6 | Team membership | `team_members.agent_id` | **TEMPLATE** | Locked D3: teams hold template refs, flat members. Team-boundary checks for `spawn_subtask` compare template ids. |
| 7 | Tool-call auth | `agent-tools.ts` / `questions.ts` (`task.assignedAgentId !== ctx.agent.id`) | **TEMPLATE** | `ctx.agent` is the template row; ownership checks stay template-keyed (consistent with #3/#4). |
| 8 | Agent ref resolution | `resolveAgentRef` (id/slug/name) | **TEMPLATE** | Names/slugs are template-level; there is no user-facing instance name. |
| 9 | `agent:self` memory scope | `scopes.ts` `expandScopes`, `agent-memory.ts`, `preamble.ts` write dirs | **INSTANCE** (when run has a project) | Locked D5 — the point of P3. In a project: `{scope:'agent', agentSlug:T, projectSlug:P}`, vault dir `agents/<T>/<P>/`. No project: template dir as today. `noteMatchesFilters` gains agent-scope project matching (else instance filters would match template notes — cross-project bleed). |
| 10 | `agent:<x>` cross-agent read scope | `scopes.ts` | **TEMPLATE (any project)** | Reading another agent's accumulated knowledge is deliberate and coarse; instance isolation is about *self* writes. Unchanged (`projectSlug` unset ⇒ any). |
| 11 | Injector self-note cap | `injector.ts` `source === agent:<slug>` | **TEMPLATE** | `source` frontmatter carries the template slug (writer identity), not location. Unchanged. |
| 12 | Spawn git identity | `run-manager.ts` `GIT_AUTHOR_NAME` | **TEMPLATE** | Commit attribution is per-agent; the repo itself identifies the project. Unchanged. |
| 13 | Pipeline steps | `pipeline_steps.agent_id` | **TEMPLATE** | Pipelines pick capability; instance materializes per run (#1/#2 handle it). |
| 14 | Cron targets | `cron_jobs.target_id` | **TEMPLATE** | Same as #13. |
| 15 | Draft/creator flows | `draft-service.ts`, `one-shot.ts` (`completeOnce`, no run row) | **TEMPLATE** | Creation-time tooling; no project context, no instance. |
| 16 | Terminals | `terminal/manager.ts` `meta.agentId` | **TEMPLATE** | Informational label only. |
| 17 | Auto-spawn throttle | `service.ts` `autoSpawnAllowed` (global window count) | **n/a (global)** | Counts runs, not identities. Wakes bypass it (P1); unchanged here. |

## Note copy on first instantiate (P3-Q1 LOCKED)

Creating an instance **copies** the template's `agent:self` notes
(`scope='agent', agent_slug=T, project_slug IS NULL`) into the instance scope
(`project_slug=P`, files under `agents/<T>/<P>/`). Divergence starts there; template
notes written *after* instantiation do not flow (isolation is the feature).
`deriveScopeFromPath` learns the 4-segment form `agents/<T>/<P>/note.md`.

## Implementation decisions within locked semantics (recorded per §0 contract)

1. **S1-a clamp persistence — new column `tasks.parent_effective_tools`** (JSON
   `{allowed,disallowed} | null`, migration `0006`). The plan requires the child's
   LEAST-privilege bound "persisted as an immutable snapshot" at delegation time; a
   dedicated column keeps it separate from the owner-editable task tool columns
   (provenance stays clean, an owner edit can't silently lift a delegation clamp).
   At child-run start, `resolveRunEffectiveTools` intersects the normal
   Global→Agent→Project→Task resolution with this bound (`intersectEffectiveTools`,
   shared, truth-table-tested; `isToolPolicySubset(result, bound)` holds by
   construction).
2. **EC3 "privileged (tool-requesting) descriptions route through approval"** is
   enforced **structurally, not by text-classification**: `spawn_subtask` has *no*
   tool-granting parameter at all, and the LEAST clamp (#1) makes privilege
   escalation impossible by construction — same-team spawns cannot mint capability
   the parent lacks, so the human gate is reserved for the cross-team boundary
   (per-spawn approval, P3-Q2). A keyword sniffer over descriptions would be
   security theater; the structural guarantee is strictly stronger.
