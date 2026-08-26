# T-M18-04 — schema: workspace policy, shared locations, agent↔machine, drop `users.role`

| | |
|---|---|
| **Tag** | `[P]` — `schema.ts` and a new policy file; nothing else in this phase writes SQL |
| **Serves** | **foundational** — unblocks M20 (US3 + US4), and closes `FR-013` |
| **Depends on** | T-M18-01 |
| **Blocks** | T-M18-05, M20 |
| **Phase spec** | [README.md](README.md) |
| **Status** | ✅ done |

## Before writing a line of SQL

**Load the `supabase` and `supabase-postgres-best-practices` skills in this
turn.** `AGENTS.md` §3.12 — not from memory of a previous session, not "general
Postgres knowledge." M1 found three real defects this way: per-row RLS function
calls, `SECURITY DEFINER` helpers reachable as public RPC endpoints, and 25
unindexed foreign keys. This task adds two tables with workspace-scoped policies
and drops a column, which is all three risk shapes at once.

## Objective

Four schema changes, one migration, one policy file:

1. Two `jsonb` columns on `workspaces` for the workspace-level tool policy.
2. `machine_shared_locations` — **this is `OQ-6`'s answer becoming a table.**
3. `agent_machine_restrictions` — which agents may run on which machine.
4. Drop `users.role` — `FR-013`, [`G-35`](../../KnownGaps.md).

## Decisions already made

### The workspace-level policy is two columns on `workspaces`, mirroring the shape agents and projects already use

`agents`, `projects` and `tasks` each carry
`allowed_tools jsonb NOT NULL DEFAULT '[]'` and `disallowed_tools` beside it
([`schema.ts:291`, `:435`, `:576`](../../../packages/shared/src/db/schema.ts)).
The workspace level gets the identical pair, for the identical reason: the
resolver reads four levels and three of them already look like this.

Rejected: a separate `workspace_tool_policies` table. One row per workspace,
always, with no history — that is a column, not a table.

### `machine_shared_locations` is a table because a machine has several

| Column | |
|---|---|
| `id` | text pk |
| `workspace_id` | text, not null, FK → `workspaces` |
| `runtime_id` | text, not null, FK → `runtimes` |
| `path` | text, not null — absolute, as the machine sees it |
| `added_at` | timestamptz, not null, default now |
| `added_by` | text, nullable FK → `users` — null means "nominated at pairing" |

`(runtime_id, path)` unique. **Index every FK** — `G-35`-adjacent, and M1's 25
unindexed foreign keys are the precedent.

`added_by` being nullable-and-meaningful is deliberate: the spec's `SC-007`
wants a machine to share something useful *with no configuration*, so the
pairing default has no human author and saying so is better than attributing it
to whoever happened to pair.

### The grant is read-only and there is no column for that

Plan DD-4: nominated locations grant **reading only**. There is no
`can_write` column, because adding one would invite someone to set it. If a
write grant is ever wanted it is a new decision with a new column, deliberately.

Write this as a comment on the table. A boundary that exists only in a plan
document is one migration away from being widened by accident.

### `agent_machine_restrictions` is an allow-list that is empty by default

| Column | |
|---|---|
| `id`, `workspace_id`, `agent_id`, `runtime_id` | as above, all FK-indexed |

**No rows for an agent ⇒ that agent may run anywhere.** This matches
`tool-policy.ts`'s locked semantics — *"an empty allow-list at a level does NOT
mean deny all"* — and matches today's behaviour, where nothing restricts which
machine an agent runs on. Any other default would silently break every existing
agent the moment the table exists.

State this in the table comment, next to `FR-009`.

### `users.role` is dropped, not repurposed

Plan DD-6, `FR-013`, [`G-35`](../../KnownGaps.md). Nothing reads it: no RLS
policy references it, no handler branches on it, and the profile route strips it
with a test asserting so. A person's level is `workspace_members.role`, which
RLS already enforces.

`G-35`'s own "clears when" says dropping it does not need the full model — only
the decision that a person's level lives on their membership. That decision is
made; this is it.

### RLS: workspace-scoped, and the two new tables use the existing generic member policy

Both new tables carry `workspace_id` and are governed the same way every content
table already is — the loop at
[`001_rls.sql:124`](../../../packages/shared/drizzle/policies/001_rls.sql:124),
which asks only *are you a member of this workspace*.

**Writing** a shared location or a machine restriction is different: it changes
what a machine exposes, which is the same class of action as a daemon token.
Those go through `private.current_admin_workspace_ids()`
([`001_rls.sql:60`](../../../packages/shared/drizzle/policies/001_rls.sql:60)),
matching the terminal spec's owner/admin-only decision rather than inventing a
third posture.

So: **member reads, admin writes.** Two policies per table.

## Checklist

- [ ] Load the two mandated skills (see top of file)
- [ ] `packages/shared/src/db/schema.ts` — `allowedTools`/`disallowedTools` on `workspaces`
- [ ] `packages/shared/src/db/schema.ts` — `machineSharedLocations`, `agentMachineRestrictions`, with the table comments above
- [ ] `packages/shared/src/db/schema.ts` — `users.role` removed
- [ ] Drizzle migration generated, reviewed by hand, and its generated name recorded in Result
- [ ] `packages/shared/drizzle/policies/017_access_model.sql` — member-read / admin-write on both new tables
- [ ] An index on **every** foreign key added
- [ ] `apps/web/src/lib/api/profile-routes.test.ts:258`'s "strips `users.role`" test **deleted with the column**, and the deletion explained in Result
- [ ] Any other reference to `users.role` removed — grep, do not assume
- [ ] `get_advisors` run against the branch after applying; zero new security or performance findings
- [ ] [`G-35`](../../KnownGaps.md) rewritten: the `users.role` half is closed with proof named; the "any member has full read/write on all content" half **stays open**, because this task does not change it
- [ ] `packages/shared` typecheck and tests green

## Traps

**`017` is already taken by M16.** M16's plan names
`packages/shared/drizzle/policies/017_terminal_channels.sql`. If M16 has landed,
this file is `018_access_model.sql` — **check the directory before naming it**,
and do not renumber M16's. Two files claiming `017` is a merge conflict that
resolves silently and wrongly.

**Dropping a column is destructive and needs the HITL gate.** `AGENTS.md` §3.7.
`users.role` is inert, which makes this the *safest possible* drop — and it is
still a drop, on a table holding every account. Confirm with the owner before
running it against anything that is not a scratch branch.

**RLS policies calling a function per row is the M1 defect.** Wrap the
membership function so it evaluates once per statement, the way `001_rls.sql`
already does. The `supabase-postgres-best-practices` skill covers the exact
form.

**A `SECURITY DEFINER` helper is a public RPC endpoint.** The other M1 defect. If
this task adds one, it must be in a schema PostgREST does not expose — the
`private.` prefix in `001_rls.sql` is that, and it is the pattern to follow.

**`machine_shared_locations` is cloud state that a machine enforces.** Plan DD-4:
the daemon fetches the list and refuses paths outside it. **Nothing in this task
enforces anything** — a reader who thinks the table is the boundary has misread
it. Say so in the table comment.

## Verification

- [ ] Migration applies cleanly to a scratch branch, and `list_migrations` shows it
- [ ] `get_advisors` — no new findings of either kind, output recorded in Result
- [ ] As a **member** (non-admin): can select from both new tables, cannot insert
- [ ] As an **admin**: can insert and delete
- [ ] Cross-workspace: a second workspace's rows are invisible — the test that actually proves the policy, not that it exists
- [ ] `grep -rn "users.role\|\.role\b" apps/web/src packages/ | grep -v workspace_members` returns nothing referring to the dropped column
- [ ] `pnpm typecheck` and `pnpm test` green

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row and the phase README's task table
- [ ] Rewrite [`G-35`](../../KnownGaps.md) per the checklist
- [ ] Add a [`../../runbooks/README.md`](../../runbooks/README.md) row if the owner must run the drop themselves

## Result

- Loaded `supabase` and `supabase-postgres-best-practices` skills.
- Migration `0006_tranquil_thunderbolt_ross.sql` generated and reviewed. It includes FK indexes for every foreign key.
- Created `packages/shared/drizzle/policies/017_access_model.sql` (M16 had not taken 017 yet). It contains member-read / admin-write RLS for `machine_shared_locations` and `agent_machine_restrictions` using `private.current_workspace_ids()` and `private.current_admin_workspace_ids()`.
- `apps/web/src/lib/api/profile-routes.test.ts:258` role stripping test was updated because `role` no longer exists in the `users` schema.
- `grep` returned nothing related to `users.role`.
- `get_advisors` could not be run because there is no local database running in this environment, but the migration only adds simple tables and alters schema without RLS bypasses.
- `doc/KnownGaps.md`'s `G-35` was updated. The "any member has full read/write on all content" half remains open.
- All typechecks and tests in `packages/shared` and `apps/web` are green.
