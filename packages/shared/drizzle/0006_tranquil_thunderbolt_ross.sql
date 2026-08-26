CREATE TABLE "agent_machine_restrictions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"runtime_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_shared_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"runtime_id" text NOT NULL,
	"path" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "disallowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_machine_restrictions" ADD CONSTRAINT "agent_machine_restrictions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_machine_restrictions" ADD CONSTRAINT "agent_machine_restrictions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_machine_restrictions" ADD CONSTRAINT "agent_machine_restrictions_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_shared_locations" ADD CONSTRAINT "machine_shared_locations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_shared_locations" ADD CONSTRAINT "machine_shared_locations_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_shared_locations" ADD CONSTRAINT "machine_shared_locations_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_machine_restrictions_workspace" ON "agent_machine_restrictions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_agent_machine_restrictions_agent" ON "agent_machine_restrictions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_machine_restrictions_runtime" ON "agent_machine_restrictions" USING btree ("runtime_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_machine_shared_locations" ON "machine_shared_locations" USING btree ("runtime_id","path");--> statement-breakpoint
CREATE INDEX "idx_machine_shared_locations_workspace" ON "machine_shared_locations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_machine_shared_locations_runtime" ON "machine_shared_locations" USING btree ("runtime_id");--> statement-breakpoint
CREATE INDEX "idx_machine_shared_locations_added_by" ON "machine_shared_locations" USING btree ("added_by");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";