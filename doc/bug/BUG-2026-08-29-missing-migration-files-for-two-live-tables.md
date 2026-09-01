# BUG-2026-08-29-missing-migration-files-for-two-live-tables

**Status:** 🟢 resolved
**Reported by:** agent — found while replaying the full drizzle migration + policy history onto a fresh production Supabase project (`doc/plans/2026-08-29-two-channel-desktop-release.md`, Band C)
**Reported:** 2026-08-29

## Symptom

Applying `packages/shared/drizzle/`'s 8 numbered table migrations (`0000`–`0007`) followed by all 27 `policies/*.sql` files, in order, to an empty database does **not** reproduce staging's actual schema. Two tables that exist live on staging — `chat_message_attachments` and `provider_model_cache` — have no `CREATE TABLE` anywhere in the numbered drizzle migrations. `provider_model_cache`'s creation is in `policies/023_provider_model_cache.sql` (a deliberate choice, per that file's own header — it needs bespoke RLS, not the shared workspace-scoped loop). `chat_message_attachments`'s creation is nowhere at all: `policies/025_chat_attachments_storage.sql` only adds RLS to it and assumes the table already exists.

## Reproduction

1. `pnpm --filter @sparstrow/shared drizzle-kit generate` (schema.ts as the only input, no DB connection needed) — reports a diff, producing a new migration for exactly these two tables, confirming `schema.ts` had moved ahead of the last recorded snapshot.
2. Attempted to apply `policies/026_chat_attachments_dispatch.sql` to the fresh production project after all 8 table migrations: `ERROR: 42P01: relation "public.chat_message_attachments" does not exist`.

## Investigation

`provider_model_cache` was created directly by `023`'s own `CREATE TABLE IF NOT EXISTS` — that one is self-contained and works fine on a fresh database (which is why replaying the files in order didn't error on it). `chat_message_attachments` has no creating statement in either the drizzle migrations or any policy file — it must have been created directly against staging (dashboard SQL editor or an ad hoc `execute_sql` call) outside the tracked migration history entirely, the same way the original `0000`–`0002` table migrations were bulk-applied via `apply-to-supabase.sql`'s paste-in method per that file's own header.

Pulled the live definition straight from staging (`information_schema.columns`, `pg_constraint`, `pg_indexes`) to confirm it matches `schema.ts`'s `chatMessageAttachments` export exactly (8 columns, 2 FKs, 2 indexes) before replicating it.

## Impact

Low today — staging already has the table, so nothing there was broken. The actual impact is that **`packages/shared/drizzle/` was not a complete, faithful record of the schema**: anyone (or any future fresh-database setup, including this one) replaying it top to bottom would have hit the exact `does not exist` error this session did, with no clue why since nothing in the tracked files mentions the table at all.

## Resolution

Created `chat_message_attachments` directly on the production project (`styichgxhecmatkholvi`) matching staging's live definition exactly, then ran `drizzle-kit generate` against `schema.ts` (no DB connection required for `generate`) to produce a proper, tool-authored migration + snapshot — `packages/shared/drizzle/0008_funny_baron_strucker.sql` and `meta/0008_snapshot.json` — rather than hand-authoring the snapshot JSON, which risks corrupting the diff base for the next real migration. `0008` also creates `provider_model_cache`'s table (already live on both projects via `023`, so this file is not re-run against them — it exists solely so a **future** fresh setup can run `drizzle-kit migrate` for `0000`–`0008` and get the complete table set before `023` adds that table's bespoke RLS on top, idempotently).

`meta/_journal.json` was updated automatically by `drizzle-kit generate` — no manual edit needed.
