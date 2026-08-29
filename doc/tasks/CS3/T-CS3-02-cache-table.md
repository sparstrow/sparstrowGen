# T-CS3-02 — `provider_model_cache` table + RLS

| | |
|---|---|
| **Tag** | `[P]` — schema/migration only, no shared file with T-CS3-01 |
| **Serves** | foundational — unblocks CS4 |
| **Depends on** | — |
| **Blocks** | T-CS3-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | done (2026-08-28) |

> Load the `supabase` and `supabase-postgres-best-practices` skills before
> writing this migration, per `AGENTS.md` §3.12 — this is a new table with
> its own RLS shape, not a tweak to an existing one.

## Objective

A workspace-scoped table caching the last discovered model list per
provider, so CS4's picker never blocks on a live dispatch.

## Decisions already made

Phase decision 2/3. Schema:

```ts
// packages/shared/src/db/schema.ts
export const providerModelCache = pgTable(
  "provider_model_cache",
  {
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    models: jsonb("models").$type<string[]>().notNull().default([]),
    live: boolean("live").notNull().default(false),
    detail: text("detail"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })],
);
```

**RLS: correcting this task's own original assumption.** Checking the most
recent precedent (`daemon_identities`, `019_daemon_realtime_identity.sql`)
found new tables get their **own** migration file with bespoke RLS, not the
shared `001_rls.sql` loop — but more importantly, the generic `for all`
shape that loop grants is wrong for this table regardless of which file it
lives in. Every write here goes through `record_provider_models`
(T-CS3-03, `security definer`, which bypasses RLS entirely) — granting
workspace members a direct client-side INSERT/UPDATE too would let any
member forge a fake "live" result straight past that function's own
validation. Shipped instead: a bespoke policy, own migration file
(`023_provider_model_cache.sql`), **SELECT only** for workspace members,
`revoke insert, update, delete ... from authenticated` explicit.

## Checklist

- [x] `providerModelCache` table added to `schema.ts` (right after
      `chatTurns`), matching this file's existing `boolean`/`jsonb`/composite
      `primaryKey` conventions exactly (`runtimeProjects` was the closest
      precedent for the composite key shape)
- [x] New migration `023_provider_model_cache.sql` — own file, bespoke RLS
      (see Decisions correction above), not the shared `001_rls.sql` loop
- [x] `get_advisors` run clean after — no new item for this table (no
      unindexed FK: the composite primary key's leading column already
      covers `workspace_id` lookups, so no separate index was needed, unlike
      `daemon_identities`' miss in Band 25)
- [x] `pnpm --filter @sparstrow/shared typecheck` and `test` green (316 tests)

## Traps

- **Confirmed live, not assumed**: exactly one policy exists on the table
  (`provider_model_cache_member_select`, `SELECT`) and `authenticated` has
  no INSERT/UPDATE/DELETE grant — checked directly against `pg_policies` on
  the real project after applying, not inferred from the migration text.
- **`(workspaceId, provider)` as the primary key is load-bearing for the
  upsert in T-CS3-03** — `record_provider_models` will rely on `on conflict
  (workspace_id, provider) do update` working, which needs exactly this
  composite key, not a separate surrogate id.

## Verification

- [x] Migration applied live to the real project (`pnymngoqseltgigcfevq`,
      via MCP `apply_migration`), not just checked against a fresh/local
      database
- [x] `get_advisors` (security) clean — no new item introduced
- [x] `pg_policies` inspected directly: exactly one SELECT policy, no
      write grant to `authenticated` — confirms the RLS shape is what was
      intended, not just that *a* policy exists

## On completion

- [x] `pnpm --filter @sparstrow/shared typecheck` and `test` green
- [x] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

**2026-08-28 — done, RLS shape corrected from plan.** Built as its own
migration (`023_provider_model_cache.sql`) with a bespoke, asymmetric
policy — SELECT for workspace members, no direct write grant at all —
rather than this task's own original plan (add to `001_rls.sql`'s shared
`for all` loop). The generic loop would have let any workspace member
write a fake "live" model list straight into the cache, bypassing
`record_provider_models`' own validation entirely; since every real write
already goes through that function (which bypasses RLS as `security
definer`), workspace members never need a direct write grant at all.

Applied live to the shared project, not just written to a file.
`get_advisors` clean, and `pg_policies` inspected directly to confirm the
exact intended shape (one SELECT policy, zero write grants) rather than
just "a policy exists somewhere."
