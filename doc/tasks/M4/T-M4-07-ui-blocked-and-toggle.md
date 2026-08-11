# T-M4-07 — UI: blocked-project actions and the per-runtime snapshot toggle

| | |
|---|---|
| **Tag** | `[P]` parallel — `packages/ui` plus two `/api/v1` handlers of its own |
| **Depends on** | T-M4-01 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | queued |

> Before writing a component: read `DESIGN.md` and `PRODUCT.md`, then use the
> `shadcn` MCP to check for an existing block. AGENTS.md §3.11, mandatory order.

## Objective

Two things the command spine makes possible for the first time:

1. A task blocked on a missing project offers **relink**, **clone**, **unbind**
   and **reassign** — the four actions plan decision 1 promised.
2. The WIP snapshot toggle becomes a **per-runtime** control in the Machines
   card, closing **`G-6`**.

## Decisions already made

**The four actions are a task-row affordance, not a settings page.** They appear
where the problem appears: a task in `project_not_available`, with the machine
named. A user who has to go looking for the fix has already been failed by the
error.

**Reassign is the first action offered when another bound runtime exists.** It is
the only one that needs nothing from the user and cannot go wrong. Relink asks
for a path; clone copies gigabytes; unbind destroys a binding.

**The toggle lives in the Machines card, per runtime, and not in workspace
settings** — `G-6`'s own conclusion. The machines can legitimately disagree: a
laptop with a small disk and a workstation with a large one have different right
answers, and a workspace-wide switch would silently impose one.

**A per-runtime setting shows what the machine last reported, not what was
requested.** Optimistically flipping a switch that then fails to reach an offline
daemon is exactly the "flips and silently changes nothing" failure `G-6` was
opened to avoid. The row is disabled with a reason when the runtime is offline,
and reflects the acked value once the command lands.

## The `/api/v1` surface this needs

| Route | Purpose |
|---|---|
| `PUT /runtimes/:id/projects/:projectId` | Relink — write `local_path`, set `state = 'bound'` |
| `DELETE /runtimes/:id/projects/:projectId` | Unbind |
| `POST /runtimes/:id/projects/:projectId/clone` | Enqueue `project.clone` |
| `PUT /runtimes/:id/settings` | Enqueue `settings.set` for an allowlisted key |
| `PATCH /tasks/:id` (existing) | Reassign — set `target_runtime_id`, status back to `todo` |

All five run as the user's session with RLS as the backstop, unlike
`/api/daemon/*`. Relink writes a path the browser cannot verify; that is fine and
expected — the daemon's next binding report corrects it, and the row reads
`missing` until it does.

## Checklist

- [ ] `packages/ui/src/lib/api.ts` — `ApiError` carries `reason` from the response body. T-M4-03 made every enqueue failure send one; nothing can read it yet, and without this the UI has to match on prose to decide which action to offer
- [ ] Blocked-task affordance: reassign / relink / clone / unbind, in that order, naming the runtime
- [ ] Reassign hidden when no other runtime is bound to that project; clone hidden when `projects.gitRemote` is null
- [ ] The five routes above, with reason tokens shared from `@sparstrow/shared`
- [ ] Machines card: per-runtime WIP snapshot switch + retention count
- [ ] Switch disabled with an explanatory line when the runtime is offline
- [ ] Switch reflects the acked value, never an optimistic one
- [ ] The local-only Settings card keeps working unchanged (`G-2` is about that card; do not "unify" the two here)
- [ ] `G-6` deleted from `doc/KnownGaps.md`, with the proof named
- [ ] Knowledge Center: the four global-claim articles re-read per AGENTS.md §3.2 — remote dispatch changes what this product *is*, and `limitations.md` currently says work runs only where you start it
- [ ] Every edited article's `updated:` frontmatter bumped, and each keeps its `## Known Limitations & Boundaries` section

## Traps

**`packages/ui` is shared by the local core-served UI and the hosted app.** The
Machines card must degrade honestly in the local UI, where there may be no
account at all — that is the `account === null` branch `G-2` describes.

**Do not remove the local Settings toggle.** It is the only control that works
on an unpaired machine, which is a supported state.

**An allowlisted key list on the client is not a security control.** The
allowlist that matters is on the daemon (T-M4-04) and in the route. The UI's copy
is for rendering, and the reviewer of this diff should check both other places
exist.

**Documenting an unbuilt capability is a defect** (§3.2). Clone lands in this
phase, so it may be documented; the Realtime doorbell does not, so nothing may
claim instant dispatch.

## Verification

- [ ] Browser pass on staging: a task in `project_not_available` shows all four actions with the machine named
- [ ] Reassign moves the task to another bound runtime and it runs there
- [ ] The snapshot switch flips, the daemon acks, and the value survives a reload
- [ ] With the daemon stopped, the switch is disabled and says why
- [ ] Deferred to T-M4-08: clone end-to-end, which needs a real remote

## On completion

- [ ] Tick 6.7 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)
