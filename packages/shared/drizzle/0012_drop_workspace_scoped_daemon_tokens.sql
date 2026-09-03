ALTER TABLE "daemon_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pairing_attempts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "daemon_tokens" CASCADE;--> statement-breakpoint
DROP TABLE "pairing_attempts" CASCADE;--> statement-breakpoint
-- Backfill: every existing runtime becomes its own machine before
-- `machine_id` is tightened to NOT NULL. We cannot tell which runtimes shared
-- a physical computer -- that knowledge only ever existed on the machines
-- themselves -- so one machine per runtime is the honest reconstruction. It
-- keeps every dispatch row, run and transcript pointing at a live runtime.
-- Ownership goes to the workspace owner, the only user id reachable from here.
-- Machines re-claim themselves on next launch and collapse back onto their
-- real ids; these rows are a bridge, not a destination.
INSERT INTO "machines" ("id", "user_id", "name", "os", "hostname", "is_electron", "core_version", "last_seen_at", "created_at")
SELECT
  'legacy_' || r."id",
  w."owner_id",
  r."name",
  r."os",
  r."hostname",
  r."is_electron",
  r."core_version",
  r."last_heartbeat",
  r."created_at"
FROM "runtimes" r
JOIN "workspaces" w ON w."id" = r."workspace_id"
WHERE r."machine_id" IS NULL;--> statement-breakpoint
UPDATE "runtimes" SET "machine_id" = 'legacy_' || "id" WHERE "machine_id" IS NULL;--> statement-breakpoint
ALTER TABLE "runtimes" ALTER COLUMN "machine_id" SET NOT NULL;