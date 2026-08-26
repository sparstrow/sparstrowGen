---
name: data-modeling-and-rls
description: >-
  Applies Sparstrowgen's specific workspace-scoped data-modeling and RLS
  conventions on top of generic Postgres practice — entity/relationship
  design, the InitPlan-hoistable policy shape, and FK-index coverage for
  packages/shared/src/db/schema.ts. Use when designing or reviewing any table
  in the cloud control plane.
metadata:
  sparstrowgen-owner: data-modeler
---

# Data modeling and RLS in this repo

This skill is the repo-specific companion to the generic
`supabase-postgres-best-practices` skill — load both; this one only covers
what's particular to Sparstrowgen's cloud control plane
(`packages/shared/src/db/schema.ts`, Drizzle ORM, Supabase Postgres).

## The three rules `schema.ts` itself states

Read the header comment in `packages/shared/src/db/schema.ts` before
designing anything — it states three rules deliberately:

1. **Local vocabulary wins.** Statuses/enums mirror `@sparstrow/shared`'s Zod
   schemas exactly (`taskStatusSchema`, `runStatusSchema`,
   `memoryNoteTypeSchema`, …). Don't invent a new vocabulary for the cloud
   side of an existing concept.
2. **`workspaceId` on every table, including child tables.** Denormalized on
   purpose — RLS policies stay a flat `workspace_id` check instead of a
   recursive join. Faster, and far harder to get subtly wrong.
3. **Columns mirror the local SQLite schema** (`packages/core/src/db/
   schema.ts`). Sync between daemon and cloud is a field copy, not a mapping
   layer. An added cloud column is additive; a dropped one carries a comment
   saying why.

Enums are `text` + a comment, not Postgres enums — altering a pg enum is a
migration hazard, and Zod is the authority on the vocabulary, not the
database.

## The RLS policy shape

Policies are written as:

```sql
using (workspace_id in (select private.current_workspace_ids()))
```

never as:

```sql
using (public.is_workspace_member(workspace_id))   -- DON'T
```

The second form passes the row's own column into the function, so Postgres
can't hoist it — it becomes a per-row call. The first takes no arguments, so
it's constant per query: evaluated once as an InitPlan, then a hashed
membership test per row. On `run_events` (the highest-row-count table in
this schema) that's the difference between one lookup and one per event.
Same reasoning applies to `auth.uid()`, always wrapped as
`(select auth.uid())`.

`SECURITY DEFINER` helpers live in the `private` schema, not `public` —
PostgREST only exposes `public`, so a helper in `private` can never be
reached as a REST RPC endpoint regardless of its `EXECUTE` grants.
`SECURITY DEFINER` is required for correctness too, not just speed: the
helper reads `workspace_members`, which itself has RLS enabled. An `INVOKER`
function would re-enter that policy and recurse.

## FK indexes

Postgres does not index foreign-key columns automatically. Run the check
query in `packages/shared/drizzle/policies/README.md`'s "Foreign-key
indexes" section against any new table before calling a design done — this
schema shipped 25 missing FK indexes once (mostly `workspace_id`, the column
every policy filters on) before a review caught it.

## Where the design goes

This agent doesn't write migrations or `.sql` files (see
`.claude/agents/architecture/data-modeler.md`'s scope boundaries). Output a
plain sketch: table name, columns + types, relationships, which `private`
helper each new policy filters on, and whether the table needs a
`002_realtime.sql` publication entry. Whoever executes it runs, in order:
`drizzle-kit migrate` → `001_rls.sql` → `002_realtime.sql`, per
`packages/shared/drizzle/policies/README.md`'s "Apply order" — both SQL
files are idempotent (`drop policy if exists` / membership check before
`ADD TABLE`), so re-running them to pick up a new table is safe.
