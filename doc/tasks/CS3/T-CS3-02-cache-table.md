# T-CS3-02 — `provider_model_cache` table + RLS

| | |
|---|---|
| **Tag** | `[P]` — schema/migration only, no shared file with T-CS3-01 |
| **Serves** | foundational — unblocks CS4 |
| **Depends on** | — |
| **Blocks** | T-CS3-03 |
| **Phase spec** | [README.md](README.md) |
| **Status** | not started |

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

RLS: add `'provider_model_cache'` to the `workspace_scoped` array in
`001_rls.sql`'s policy-generation loop (`packages/shared/drizzle/policies/001_rls.sql:104`)
— it needs exactly the same shape every other workspace-scoped table gets,
nothing bespoke. Writing to it happens through `record_provider_models`
(T-CS3-03), not directly, but the generic `for all` policy is still the
right base (that function runs `security definer` regardless, per this
repo's existing pattern for daemon-writable rows).

## Checklist

- [ ] `providerModelCache` table added to `schema.ts`, per the shape above
      (confirm the exact `boolean`/`jsonb` column helpers match this file's
      existing conventions before copying verbatim)
- [ ] New migration file adding the table DDL and RLS (via the existing
      `001_rls.sql` loop mechanism, or its own equivalent `enable row level
      security` + policy if this repo's migration convention keeps later
      additions in their own file rather than editing `001_rls.sql` in
      place — check how `chat_message_attachments` or the most recent
      workspace-scoped table addition did it, and match that)
- [ ] `get_advisors` (or the CLI equivalent) run clean after — Band 25's own
      verification found an unindexed FK this way; don't repeat that miss
- [ ] `packages/shared` typecheck green

## Traps

- **Do not add this table to `001_rls.sql`'s array directly if this repo's
  convention has moved to per-table migration files for new tables since
  that array was written** — check the most recent precedent (e.g. how
  `daemon_identities` or `018_terminal_channels.sql` added their own RLS)
  before assuming the shared loop is still where new tables register.
- **`(workspaceId, provider)` as the primary key is load-bearing for the
  upsert in T-CS3-03** — `record_provider_models` relies on `on conflict
  (workspace_id, provider) do update` working, which needs exactly this
  composite key, not a separate surrogate id.

## Verification

- [ ] Migration applies cleanly to a fresh/local database
- [ ] `get_advisors`/equivalent clean (no unindexed FK, no missing RLS)
- [ ] A row can be inserted and read back under a real authenticated session
      scoped to that workspace, and NOT read back under a different
      workspace's session (confirms the RLS policy is actually workspace-
      scoped, not just present)

## On completion

- [ ] `pnpm typecheck` and `pnpm test` green
- [ ] Update this file's **Status** row
- [ ] Open the PR into `band/26-chat-session-and-conversation-ux`, then
      `gh pr merge <n> --auto --squash`
- [ ] Update the phase README's task table

> **Do not edit [`../MasterTaskQueue.md`](../MasterTaskQueue.md) from a task
> branch.**

## Result

<!-- Filled in when the task lands. -->
