CREATE TABLE "pairing_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"runtime_id" text NOT NULL,
	"name" text NOT NULL,
	"os" text NOT NULL,
	"hostname" text NOT NULL,
	"is_electron" boolean DEFAULT false NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"core_version" text,
	"callback" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"workspace_id" text,
	"approved_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pairing_attempts" ADD CONSTRAINT "pairing_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pairing_attempts_status_expires" ON "pairing_attempts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_pairing_attempts_workspace" ON "pairing_attempts" USING btree ("workspace_id");