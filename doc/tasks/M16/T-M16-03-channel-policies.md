# T-M16-03 — `018_terminal_channels.sql`

| | |
|---|---|
| **Tag** | `[P]` — one new SQL file plus its README row; no overlap with any sibling |
| **Serves** | **foundational** — this file *is* FR-009's enforcement |
| **Depends on** | T-M16-01 (topics and event names must be final) |
| **Blocks** | T-M16-06 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

## Objective

Author and apply the `realtime.messages` policies that decide who may listen to
and who may send on the two new topic families — the first channel policy in this
app that gates on **role** rather than membership, and the first that grants a
client any send right at all.

**Load `supabase-postgres-best-practices` and `supabase` before writing a line of
this**, per `AGENTS.md` §3.12. Not satisfied by having read them in a previous
session.

## Decisions already made

Plan **DD-4** governs this task in full and must be read first — particularly why
`010`'s "if you are adding an insert policy here, stop" is *kept* rather than
overridden, and why this is a third file rather than an edit to either existing
one.

**Four policies, two topic families, two directions.**

| Policy | Command | Topic prefix | Who | Extra condition |
|---|---|---|---|---|
| `terminal_channel_admin_read` | `select` | `terminal` | `private.current_admin_workspace_ids()` | — |
| `machine_channel_admin_read` | `select` | `machine` | `private.current_admin_workspace_ids()` | — |
| `terminal_channel_admin_send` | `insert` | `terminal` | `private.current_admin_workspace_ids()` | `event = 'input'` |
| `machine_channel_admin_send` | `insert` | `machine` | `private.current_admin_workspace_ids()` | `event = 'request'` |

Every one is `to authenticated`, scoped by `extension = 'broadcast'`, and matches
the workspace with
`split_part(realtime.topic(), ':', 2) in (select private.current_admin_workspace_ids())`
— the same shape as `010` and `015`, using the admin helper rather than the
member one.

**The event pin is the whole reason a send policy is safe here.** Without
`event = 'input'`, an admin could publish an `output` message and forge what
another tab watching the same session displays. With it, the only thing a client
can put on the wire is a keystroke on a machine where they may already open their
own shell.

**Confirm `realtime.messages` has an `event` column and that it carries the
broadcast event name** before relying on the pin. If it does not on this
project's Realtime version, **stop and do not ship a send policy without an
equivalent constraint** — a grant that was justified by a condition that turns
out not to exist is the worst outcome available here. Record what was found
either way.

**The file opens with the same RLS assertion `010` and `015` carry** — the `do
$$ … raise exception` block that refuses to apply if RLS is disabled on
`realtime.messages`, because without it a `private: true` channel is not private
and these policies are decoration.

## Checklist

- [ ] Load the `supabase` and `supabase-postgres-best-practices` skills
- [ ] Confirm `realtime.messages.event` exists and carries the broadcast event
      name on this project; record the finding in Result
- [ ] `packages/shared/drizzle/policies/018_terminal_channels.sql` — the RLS
      assertion block, `drop policy if exists` for all four, then the four
      policies
- [ ] A header comment in the house style, covering: who sends and why a client
      may here when it may not in `010`/`015`; why the event pin is load-bearing;
      why the workspace id is in the topic; the apply-after ordering
- [ ] A `-- Verify` footer with the `pg_policies` query and what to expect —
      matching `015`'s shape
- [ ] Row added to [`../../../packages/shared/drizzle/policies/README.md`](../../../packages/shared/drizzle/policies/README.md)
- [ ] Applied to the Supabase project used by the feature branch's preview
- [ ] `select policyname, cmd, roles from pg_policies where schemaname = 'realtime'`
      shows exactly six rows: `010`'s, `015`'s, and these four

## Traps

**Do not widen `010` or `015` while you are in here.** They deliberately have no
insert policy and the reasoning is written into both files. Four new named
policies alongside them is the design; a fifth generic one that happens to cover
terminals too is not.

**`private.current_admin_workspace_ids()` is `security definer` with
`set search_path = ''`.** Call it exactly as `001` defines it. Wrapping it,
copying its body inline, or calling it with the row's own column as an argument
gives up the InitPlan hoisting that `001`'s header explains at length.

**A policy that authorizes every topic shaped like anything also authorizes those
topics.** `015`'s header makes this point. The `split_part(realtime.topic(), ':', 1)`
prefix check is not decoration — without it, `terminal_channel_admin_send` grants
send on `run:` and `chat:` topics too, which is precisely the forgery `010`
forbids.

**RLS on `realtime.messages` is owned by `supabase_realtime_admin`, which
`postgres` is not a member of.** `010`'s header covers how this was handled;
follow it rather than trying to `alter table … enable row level security` and
getting a permission error that looks like a broken migration.

**Applying this to the wrong project is silent.** The verification query returns
six rows on whichever project you were connected to. Confirm the project ref
before and after.

## Verification

- [ ] The `pg_policies` query returns the six expected rows on the target project
- [ ] Negative test in SQL, both directions: a session claiming a non-admin member
      of workspace A cannot select or insert on `terminal:<A>:x`; an admin of A
      can do both
- [ ] Negative test across workspaces: an admin of workspace B cannot select or
      insert on `terminal:<A>:x`
- [ ] Insert of an `output` event by an admin client is **refused**; insert of an
      `input` event by the same client succeeds
- [ ] Re-running the whole file is a no-op (it drops before creating)

The **live** browser-side assertion — a real second session refused at subscribe
— is [`T-M16-06`](T-M16-06-verification.md) §D, matching `T-M12-06`'s precedent.

## On completion

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from this
> branch.** Its Status column is a mirror, flipped once per band in the commit
> that lands the band branch on `development` (`AGENTS.md` §2.9). Sibling
> tasks in this band are adjacent rows in one table, so ticking your own row
> conflicts with every one of them — including the parallel forks working
> beside you. Record this task's outcome in the **Status** row and **Result**
> section of *this* file.

- [ ] Update this file's **Status** row
- [ ] Update the phase README's task table
- [ ] `policies/README.md` row present

## Result

*(filled in when the task lands — including what `realtime.messages.event`
turned out to contain)*
