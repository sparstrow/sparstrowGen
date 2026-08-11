# T-M4-07 — UI: blocked-project actions and the per-runtime snapshot toggle

| | |
|---|---|
| **Tag** | `[P]` parallel — `packages/ui` plus two `/api/v1` handlers of its own |
| **Depends on** | T-M4-01 |
| **Blocks** | T-M4-08 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done — verified 2026-08-11 (live browser pass deferred to T-M4-08) |

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

- [x] `packages/ui/src/lib/api.ts` — `ApiError` carries `reason` from the response body. T-M4-03 made every enqueue failure send one; nothing can read it yet, and without this the UI has to match on prose to decide which action to offer
- [x] Blocked-task affordance: reassign / relink / clone / unbind, in that order, naming the runtime
- [x] Reassign hidden when no other runtime is bound to that project; clone hidden when `projects.gitRemote` is null
- [x] The five routes above, plus `GET /runtime-projects` (the affordance has to know whether another machine has the project before it can offer reassign)
- [x] Machines card: per-runtime WIP snapshot switch, with the retention count shown in its description
- [x] Switch disabled with an explanatory line when the runtime is offline
- [x] Switch reflects the acked value, never an optimistic one — `runtimes.reported_settings`, written only by the daemon
- [x] The local-only Settings card keeps working unchanged
- [x] `G-6` deleted from `doc/KnownGaps.md`, with the proof named
- [x] Knowledge Center: all four global-claim articles re-read; `limitations.md`, `what-is-sparstrowgen.md` and `settings.md` carried claims M4 falsifies
- [x] Every edited article's `updated:` frontmatter bumped, and each keeps its `## Known Limitations & Boundaries` section

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

- [x] 10 route tests (dispatch, both path parameters, specificity, no duplicate registration)
- [x] 740 tests green across the workspace; all four packages typecheck
- [ ] Browser pass: a task in `project_not_available` shows all four actions → **deferred to T-M4-08**
- [ ] Reassign moves the task to another bound runtime and it runs there → **deferred to T-M4-08**
- [ ] The snapshot switch flips, the daemon acks, the value survives a reload → **deferred to T-M4-08**
- [ ] Clone end-to-end, which needs a real remote → **deferred to T-M4-08**

## On completion

- [x] Tick 6.7 in [`../MasterTaskQueue.md`](../MasterTaskQueue.md)

## Result — verified 2026-08-11

### Two things were missing that the spec assumed existed

**`project_not_available` was not in `taskStatusSchema`.** The cloud schema has
documented it as part of the task vocabulary since M1, and T-M4-03 was already
writing it — but the enum was never widened, so the status the handler set was
one the type system did not admit. Worse, the board filters by column and none
of the six matched it: a parked task rendered **nowhere**. It was not "hard to
find", it was invisible, which is the failure mode a blocked state can least
afford. Added to the enum, and folded into "To do" with its own whisper, exactly
as `waiting_children` folds into "In progress" — the file's 6-column design
contract is explicit, and a seventh column for a rare state would have broken it
for every workspace that never hits one.

**`tasks.targetRuntimeId` was not in the shared schema either**, so reassign had
nothing to write. Added, marked cloud-only.

Both are the same shape of gap: the control-plane table carried a column the
zod schema did not, so the two disagreed and only the database knew.

### Showing an acked value needed a column

The decision that the switch must never render an optimistic value has a cost:
something has to store what the machine confirmed. `runtimes.reported_settings`
(migration `0002_vengeful_norrin_radd.sql`) is written **only** by the daemon —
at boot through `/register`, and after applying a `settings.set` through a new
one-column `POST /api/daemon/settings`.

That route exists rather than reusing `/register` for a specific reason:
registration runs an 8-second capability probe, and an identity payload carrying
an unprobed `capabilities: []` would wipe the field M4 dispatches on. A
one-column route cannot cause that.

The side benefit is the one that makes this properly closed: because the value
is read from the machine's own settings table, a switch flipped in that
machine's **local** Settings card shows correctly in the hosted UI too. The two
controls cannot disagree.

### Clone is queued, and says so

The clone action does not move the task to `todo` on success, and the copy says
"Clone queued" rather than "Cloned". The command has been enqueued, not
finished; the binding turns `bound` when the machine reports it. Claiming
otherwise would be the same lie the snapshot toggle was built to avoid, one
screen over.
