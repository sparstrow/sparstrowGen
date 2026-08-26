ALTER TABLE "users" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "context" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "logo_url" text;