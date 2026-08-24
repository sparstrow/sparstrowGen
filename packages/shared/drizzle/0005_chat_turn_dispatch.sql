CREATE TABLE "chat_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"waiting_reason" text,
	"assigned_runtime_id" text,
	"command_id" text,
	"provider" text,
	"model" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"retry_of_turn_id" text,
	"reply_text" text DEFAULT '' NOT NULL,
	"reply_seq" integer DEFAULT 0 NOT NULL,
	"error" text,
	"wait_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "turn_id" text;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_assigned_runtime_id_runtimes_id_fk" FOREIGN KEY ("assigned_runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_command_id_runtime_commands_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."runtime_commands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_turns_workspace" ON "chat_turns" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_chat_turns_session" ON "chat_turns" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_chat_turns_assigned_runtime" ON "chat_turns" USING btree ("assigned_runtime_id");--> statement-breakpoint
CREATE INDEX "idx_chat_turns_command" ON "chat_turns" USING btree ("command_id");--> statement-breakpoint
CREATE INDEX "idx_chat_turns_retry_of" ON "chat_turns" USING btree ("retry_of_turn_id");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_turn_id_chat_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_messages_turn" ON "chat_messages" USING btree ("turn_id");