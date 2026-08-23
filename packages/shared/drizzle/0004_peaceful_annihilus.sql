ALTER TABLE "users" ADD COLUMN "theme_surface" text DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_brand" text DEFAULT 'amber' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_mode" text DEFAULT 'system' NOT NULL;