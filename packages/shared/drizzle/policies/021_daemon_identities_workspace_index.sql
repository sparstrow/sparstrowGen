-- 021_daemon_identities_workspace_index.sql
--
-- DI, T-DI-05 close-out. `get_advisors` flagged `unindexed_foreign_keys` on
-- `public.daemon_identities.workspace_id` immediately after 019 was applied to
-- the live project — that table's other two columns are already indexed
-- (`user_id` is the primary key, `runtime_id` is `unique`), but `workspace_id`
-- had no covering index for its FK to `public.workspaces(id)`.
--
-- Unindexed matters here specifically because of the FK's `on delete cascade`:
-- deleting a workspace scans every referencing table for rows to cascade, and
-- without an index that scan is sequential over `daemon_identities`. Apply
-- AFTER 019 (which creates the table).

create index if not exists idx_daemon_identities_workspace
  on public.daemon_identities (workspace_id);

-- ── Verify ──────────────────────────────────────────────────────────────────
--
-- Rerunnable: `create index if not exists`. Applying twice is a no-op.
--
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'daemon_identities';
--
-- Expect three: the primary key's implicit index, `daemon_identities_runtime_id_key`
-- (from the `unique` constraint), and `idx_daemon_identities_workspace`.
--
-- Confirm the project ref before and after running this — applying to the
-- wrong project succeeds silently and returns the same rows there too.
