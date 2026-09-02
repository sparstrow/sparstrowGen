CREATE TABLE "access_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"machine_id" text,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "connect_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"name" text NOT NULL,
	"os" text NOT NULL,
	"hostname" text NOT NULL,
	"is_electron" boolean DEFAULT false NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"core_version" text,
	"callback" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"os" text NOT NULL,
	"hostname" text NOT NULL,
	"is_electron" boolean DEFAULT false NOT NULL,
	"core_version" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtimes" ADD COLUMN "machine_id" text;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_tokens_user" ON "access_tokens" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "idx_access_tokens_machine" ON "access_tokens" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "idx_connect_attempts_status_expires" ON "connect_attempts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_machines_user" ON "machines" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "runtimes" ADD CONSTRAINT "runtimes_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_runtimes_machine" ON "runtimes" USING btree ("machine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_runtimes_machine_workspace" ON "runtimes" USING btree ("machine_id","workspace_id");