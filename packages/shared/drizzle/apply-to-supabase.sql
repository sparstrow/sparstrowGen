-- ═══════════════════════════════════════════════════════════════════════════
-- Sparstrowgen cloud control plane — full deploy to an EMPTY database.
--
--   psql "$DATABASE_URL" -f packages/shared/drizzle/apply-to-supabase.sql
--   (or paste into the Supabase SQL Editor)
--
-- Assumes a clean schema. It creates 36 tables and will fail loudly on name
-- collisions rather than silently half-migrating. Already applied to staging
-- (db.pnymngoqseltgigcfevq) on 2026-08-09.
--
-- Sections: 1 tables · 2 FK indexes · 3 publication · 4 RLS · 5 realtime
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tables ──────────────────────────────────────────────────────────────
CREATE TABLE "agent_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "agent_skills" (
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"skill_id" text NOT NULL,
	CONSTRAINT "agent_skills_agent_id_skill_id_pk" PRIMARY KEY("agent_id","skill_id")
);


CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"cwd" text,
	"add_dirs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disallowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permission_mode" text DEFAULT 'default' NOT NULL,
	"mcp_servers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"max_turns" integer,
	"memory_read_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"memory_write_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"extra_args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"signal_extraction" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"specter_report" jsonb,
	"import_id" text,
	"sandbox_project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"project_id" text,
	"agent_id" text,
	"provider" text,
	"model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"draft" jsonb,
	"user_id" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "cron_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"cron_expr" text NOT NULL,
	"timezone" text DEFAULT 'system' NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"prompt" text NOT NULL,
	"project_id" text,
	"team_id" text,
	"target_runtime_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "daemon_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"runtime_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daemon_tokens_token_hash_unique" UNIQUE("token_hash")
);


CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text,
	"team_id" text,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"plan_version" integer DEFAULT 0 NOT NULL,
	"replan_count" integer DEFAULT 0 NOT NULL,
	"consensus" text DEFAULT 'auto' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"pending_replan_reason" text,
	"blocked_reason" text,
	"plan_summary" text,
	"planner_run_id" text,
	"planner_attempts" integer DEFAULT 0 NOT NULL,
	"consensus_run_id" text,
	"consensus_approved_version" integer,
	"world_state" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "memory_contradictions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_slug" text,
	"note_a" text NOT NULL,
	"note_b" text NOT NULL,
	"axis" text DEFAULT '' NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);


CREATE TABLE "memory_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"path" text NOT NULL,
	"scope" text NOT NULL,
	"project_slug" text,
	"agent_slug" text,
	"title" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"type" text DEFAULT 'note' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"quarantined" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"superseded_by" text,
	"content_hash" text DEFAULT '' NOT NULL,
	"last_writer_runtime_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"from_type" text NOT NULL,
	"from_agent_id" text,
	"to_agent_id" text,
	"project_id" text,
	"task_id" text,
	"subject" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'unread' NOT NULL,
	"spawned_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "pairing_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_runtime_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "pipeline_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"status" text NOT NULL,
	"trigger" text NOT NULL,
	"trigger_prompt" text,
	"current_step" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);


CREATE TABLE "pipeline_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"position" integer NOT NULL,
	"agent_id" text NOT NULL,
	"prompt_template" text NOT NULL,
	"on_failure" text DEFAULT 'abort' NOT NULL
);


CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"project_id" text,
	"team_id" text,
	"description" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "plan_edges" (
	"workspace_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"user_id" text,
	CONSTRAINT "plan_edges_goal_id_plan_version_from_node_id_to_node_id_pk" PRIMARY KEY("goal_id","plan_version","from_node_id","to_node_id")
);


CREATE TABLE "plan_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"action_id" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"agent_hint" text,
	"agent_id" text,
	"kind" text DEFAULT 'work' NOT NULL,
	"pre" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cost" double precision DEFAULT 1 NOT NULL,
	"task_id" text,
	"position" jsonb,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "project_directives" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"body" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disallowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_project_id" text,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"git_remote" text,
	"execution_profile" text DEFAULT 'factory' NOT NULL,
	"staging_branch" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "run_events" (
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	CONSTRAINT "run_events_run_id_seq_pk" PRIMARY KEY("run_id","seq")
);


CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_instance_id" text,
	"project_id" text,
	"task_id" text,
	"target_runtime_id" text,
	"pipeline_run_id" text,
	"pipeline_step_id" text,
	"trigger" text NOT NULL,
	"trigger_ref" text,
	"mode" text NOT NULL,
	"prompt" text NOT NULL,
	"injected_context" text,
	"injected_memory" jsonb,
	"untrusted" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"session_id" text,
	"lane" text DEFAULT 'foreground' NOT NULL,
	"effective_tools" jsonb,
	"result_text" text,
	"cost_usd" double precision,
	"num_turns" integer,
	"duration_ms" integer,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "runtime_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"runtime_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "runtime_projects" (
	"workspace_id" text NOT NULL,
	"runtime_id" text NOT NULL,
	"project_id" text NOT NULL,
	"local_path" text,
	"state" text DEFAULT 'bound' NOT NULL,
	"detail" text,
	"last_seen" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runtime_projects_runtime_id_project_id_pk" PRIMARY KEY("runtime_id","project_id")
);


CREATE TABLE "runtimes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"os" text NOT NULL,
	"hostname" text NOT NULL,
	"is_electron" boolean DEFAULT false NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"core_version" text,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "skill_files" (
	"workspace_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	CONSTRAINT "skill_files_skill_id_path_pk" PRIMARY KEY("skill_id","path")
);


CREATE TABLE "skill_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_url" text NOT NULL,
	"sandbox_project_id" text,
	"status" text DEFAULT 'cloning' NOT NULL,
	"extractor_run_id" text,
	"error" text,
	"found_skill_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"source_provider" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "task_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"task_id" text NOT NULL,
	"question" text NOT NULL,
	"why_blocked" text DEFAULT '' NOT NULL,
	"options" jsonb,
	"recommendation" text,
	"default_if_no_answer" text,
	"answer" text,
	"asked_by_run_id" text,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"user_id" text
);


CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"project_id" text,
	"status" text DEFAULT 'inbox' NOT NULL,
	"created_by_type" text DEFAULT 'user' NOT NULL,
	"created_by_agent_id" text,
	"assigned_agent_id" text,
	"assignee_user_id" text,
	"target_runtime_id" text,
	"priority" integer DEFAULT 1 NOT NULL,
	"run_id" text,
	"result" text,
	"wake_payload" text,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disallowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parent_task_id" text,
	"parent_effective_tools" jsonb,
	"hitl_approved" boolean DEFAULT true NOT NULL,
	"user_id" text,
	"team_id" text,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"team_role" text,
	"sort" integer DEFAULT 0 NOT NULL
);


CREATE TABLE "team_projects" (
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "team_projects_team_id_project_id_pk" PRIMARY KEY("team_id","project_id")
);


CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_ephemeral" boolean DEFAULT false NOT NULL,
	"linked_task_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'developer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);


CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);


CREATE TABLE "workspace_settings" (
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_settings_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);


CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);


ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agent_instances" ADD CONSTRAINT "agent_instances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "cron_jobs" ADD CONSTRAINT "cron_jobs_target_runtime_id_runtimes_id_fk" FOREIGN KEY ("target_runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "daemon_tokens" ADD CONSTRAINT "daemon_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "daemon_tokens" ADD CONSTRAINT "daemon_tokens_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "goals" ADD CONSTRAINT "goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "memory_contradictions" ADD CONSTRAINT "memory_contradictions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "plan_edges" ADD CONSTRAINT "plan_edges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "plan_edges" ADD CONSTRAINT "plan_edges_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "plan_edges" ADD CONSTRAINT "plan_edges_from_node_id_plan_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."plan_nodes"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "plan_edges" ADD CONSTRAINT "plan_edges_to_node_id_plan_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."plan_nodes"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "plan_nodes" ADD CONSTRAINT "plan_nodes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "plan_nodes" ADD CONSTRAINT "plan_nodes_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "project_directives" ADD CONSTRAINT "project_directives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "project_directives" ADD CONSTRAINT "project_directives_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "run_events" ADD CONSTRAINT "run_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runs" ADD CONSTRAINT "runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runs" ADD CONSTRAINT "runs_target_runtime_id_runtimes_id_fk" FOREIGN KEY ("target_runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runtime_commands" ADD CONSTRAINT "runtime_commands_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runtime_projects" ADD CONSTRAINT "runtime_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runtime_projects" ADD CONSTRAINT "runtime_projects_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runtime_projects" ADD CONSTRAINT "runtime_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "runtimes" ADD CONSTRAINT "runtimes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "skill_imports" ADD CONSTRAINT "skill_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "skills" ADD CONSTRAINT "skills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "task_questions" ADD CONSTRAINT "task_questions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_target_runtime_id_runtimes_id_fk" FOREIGN KEY ("target_runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "uq_agent_instances_agent_project" ON "agent_instances" USING btree ("agent_id","project_id");

CREATE UNIQUE INDEX "uq_agents_workspace_slug" ON "agents" USING btree ("workspace_id","slug");

CREATE INDEX "idx_agents_workspace_status" ON "agents" USING btree ("workspace_id","status");

CREATE INDEX "idx_chat_messages_session" ON "chat_messages" USING btree ("session_id","created_at");

CREATE INDEX "idx_chat_sessions_kind" ON "chat_sessions" USING btree ("workspace_id","kind","status");

CREATE INDEX "idx_chat_sessions_project" ON "chat_sessions" USING btree ("project_id");

CREATE INDEX "idx_cron_jobs_workspace" ON "cron_jobs" USING btree ("workspace_id","enabled","next_run_at");

CREATE INDEX "idx_daemon_tokens_runtime" ON "daemon_tokens" USING btree ("runtime_id","revoked_at");

CREATE INDEX "idx_goals_workspace_status" ON "goals" USING btree ("workspace_id","status");

CREATE INDEX "idx_goals_project" ON "goals" USING btree ("project_id");

CREATE INDEX "idx_memory_contradictions_open" ON "memory_contradictions" USING btree ("workspace_id","resolved_at");

CREATE UNIQUE INDEX "uq_memory_contradictions_pair" ON "memory_contradictions" USING btree ("workspace_id","note_a","note_b");

CREATE UNIQUE INDEX "uq_memory_notes_workspace_path" ON "memory_notes" USING btree ("workspace_id","path");

CREATE INDEX "idx_memory_notes_scope" ON "memory_notes" USING btree ("workspace_id","scope","project_slug","agent_slug");

CREATE INDEX "idx_memory_notes_sync" ON "memory_notes" USING btree ("workspace_id","updated_at");

CREATE INDEX "idx_messages_to" ON "messages" USING btree ("workspace_id","to_agent_id","status");

CREATE INDEX "idx_pairing_codes_workspace" ON "pairing_codes" USING btree ("workspace_id","expires_at");

CREATE INDEX "idx_pipeline_runs_pipeline" ON "pipeline_runs" USING btree ("pipeline_id","status");

CREATE INDEX "idx_pipeline_steps_pipeline" ON "pipeline_steps" USING btree ("pipeline_id","position");

CREATE INDEX "idx_pipelines_workspace" ON "pipelines" USING btree ("workspace_id","team_id");

CREATE INDEX "idx_plan_edges_goal" ON "plan_edges" USING btree ("goal_id","plan_version");

CREATE INDEX "idx_plan_edges_to" ON "plan_edges" USING btree ("to_node_id");

CREATE INDEX "idx_plan_nodes_goal" ON "plan_nodes" USING btree ("goal_id","plan_version");

CREATE INDEX "idx_plan_nodes_task" ON "plan_nodes" USING btree ("task_id");

CREATE UNIQUE INDEX "uq_plan_nodes_goal_version_action" ON "plan_nodes" USING btree ("goal_id","plan_version","action_id");

CREATE INDEX "idx_project_directives_project" ON "project_directives" USING btree ("project_id","sort");

CREATE UNIQUE INDEX "uq_projects_workspace_slug" ON "projects" USING btree ("workspace_id","slug");

CREATE INDEX "idx_projects_parent" ON "projects" USING btree ("parent_project_id");

CREATE INDEX "idx_runs_workspace_status" ON "runs" USING btree ("workspace_id","status");

CREATE INDEX "idx_runs_agent" ON "runs" USING btree ("agent_id");

CREATE INDEX "idx_runs_created" ON "runs" USING btree ("workspace_id","created_at");

CREATE UNIQUE INDEX "uq_runtime_commands_idem" ON "runtime_commands" USING btree ("idempotency_key");

CREATE INDEX "idx_runtime_commands_claim" ON "runtime_commands" USING btree ("runtime_id","status","created_at");

CREATE INDEX "idx_runtime_projects_project" ON "runtime_projects" USING btree ("project_id","state");

CREATE INDEX "idx_runtimes_workspace" ON "runtimes" USING btree ("workspace_id","status");

CREATE INDEX "idx_skill_imports_workspace" ON "skill_imports" USING btree ("workspace_id","status");

CREATE UNIQUE INDEX "uq_skills_workspace_name" ON "skills" USING btree ("workspace_id","name");

CREATE INDEX "idx_task_questions_queue" ON "task_questions" USING btree ("workspace_id","answered_at","asked_at");

CREATE INDEX "idx_task_questions_task" ON "task_questions" USING btree ("task_id");

CREATE INDEX "idx_tasks_workspace_status" ON "tasks" USING btree ("workspace_id","status");

CREATE INDEX "idx_tasks_assigned" ON "tasks" USING btree ("assigned_agent_id");

CREATE INDEX "idx_tasks_parent" ON "tasks" USING btree ("parent_task_id");

CREATE INDEX "idx_tasks_runtime" ON "tasks" USING btree ("target_runtime_id","status");

CREATE INDEX "idx_team_members_team" ON "team_members" USING btree ("team_id","sort");

CREATE UNIQUE INDEX "uq_teams_workspace_slug" ON "teams" USING btree ("workspace_id","slug");

CREATE INDEX "idx_workspace_members_user" ON "workspace_members" USING btree ("user_id","workspace_id");

CREATE UNIQUE INDEX "uq_workspace_members" ON "workspace_members" USING btree ("workspace_id","user_id");

-- ── 2. Foreign-key indexes ─────────────────────────────────────────────────
CREATE INDEX "idx_agent_instances_workspace" ON "agent_instances" USING btree ("workspace_id");

CREATE INDEX "idx_agent_instances_project" ON "agent_instances" USING btree ("project_id");

CREATE INDEX "idx_agent_skills_workspace" ON "agent_skills" USING btree ("workspace_id");

CREATE INDEX "idx_agent_skills_skill" ON "agent_skills" USING btree ("skill_id");

CREATE INDEX "idx_chat_messages_workspace" ON "chat_messages" USING btree ("workspace_id");

CREATE INDEX "idx_cron_jobs_runtime" ON "cron_jobs" USING btree ("target_runtime_id");

CREATE INDEX "idx_daemon_tokens_workspace" ON "daemon_tokens" USING btree ("workspace_id");

CREATE INDEX "idx_pipeline_runs_workspace" ON "pipeline_runs" USING btree ("workspace_id");

CREATE INDEX "idx_pipeline_steps_workspace" ON "pipeline_steps" USING btree ("workspace_id");

CREATE INDEX "idx_plan_edges_from" ON "plan_edges" USING btree ("from_node_id");

CREATE INDEX "idx_plan_edges_workspace" ON "plan_edges" USING btree ("workspace_id");

CREATE INDEX "idx_plan_nodes_workspace" ON "plan_nodes" USING btree ("workspace_id");

CREATE INDEX "idx_project_directives_workspace" ON "project_directives" USING btree ("workspace_id");

CREATE INDEX "idx_run_events_workspace" ON "run_events" USING btree ("workspace_id");

CREATE INDEX "idx_runs_runtime" ON "runs" USING btree ("target_runtime_id");

CREATE INDEX "idx_runtime_commands_workspace" ON "runtime_commands" USING btree ("workspace_id");

CREATE INDEX "idx_runtime_projects_workspace" ON "runtime_projects" USING btree ("workspace_id");

CREATE INDEX "idx_skill_files_workspace" ON "skill_files" USING btree ("workspace_id");

CREATE INDEX "idx_tasks_project" ON "tasks" USING btree ("project_id");

CREATE INDEX "idx_tasks_team" ON "tasks" USING btree ("team_id");

CREATE INDEX "idx_tasks_assignee_user" ON "tasks" USING btree ("assignee_user_id");

CREATE INDEX "idx_team_members_agent" ON "team_members" USING btree ("agent_id");

CREATE INDEX "idx_team_members_workspace" ON "team_members" USING btree ("workspace_id");

CREATE INDEX "idx_team_projects_project" ON "team_projects" USING btree ("project_id");

CREATE INDEX "idx_team_projects_workspace" ON "team_projects" USING btree ("workspace_id");

-- ── 3. Realtime publication exists ─────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- ── 4. Row level security ──────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security — the security boundary for the cloud control plane.
--
-- Once dispatch is cloud-canonical, anyone who can write a task row targeting a
-- runtime can cause code to run on that machine. RLS is therefore not a
-- nice-to-have here: it is the thing standing between workspace isolation and
-- remote code execution on someone else's laptop.
--
-- Apply AFTER the drizzle migration. See ./README.md for order.
--
-- Daemons are NOT covered by these policies. They authenticate with a daemon
-- token, not a Supabase session, so auth.uid() is null and every policy denies
-- them. They reach the database exclusively through SECURITY DEFINER RPCs
-- (added in M3/M4) that verify the token hash themselves.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper schema ──────────────────────────────────────────────────────────
--
-- `private` rather than `public` on purpose: PostgREST only exposes `public`,
-- so a helper living here cannot be invoked as a REST RPC endpoint no matter
-- what EXECUTE grants it carries. Policies still need to resolve the name, so
-- `authenticated` gets USAGE on the schema.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

-- ── Membership helpers ─────────────────────────────────────────────────────
--
-- These take NO arguments and return a set. That shape is the whole point:
-- a policy written as `workspace_id in (select private.current_workspace_ids())`
-- is constant per query, so Postgres evaluates it ONCE as an InitPlan and then
-- does a cheap hashed membership test per row.
--
-- The obvious alternative — `is_workspace_member(workspace_id)` — takes the
-- row's own column as an argument, which makes it a per-row function call that
-- cannot be hoisted. On a large tasks or run_events table that is the
-- difference between one lookup and one lookup per row.
--
-- SECURITY DEFINER is also load-bearing for correctness, not just speed: these
-- read workspace_members, which itself has RLS enabled below. An INVOKER
-- function would re-enter that policy and recurse. `set search_path = ''`
-- forces fully-qualified names so the body cannot be hijacked by a shadowed
-- schema, and auth.uid() is wrapped in a scalar subquery so it is evaluated
-- once rather than per candidate row inside the helper.

create or replace function private.current_workspace_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())::text;
$$;

create or replace function private.current_admin_workspace_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())::text
    and m.role in ('owner', 'admin');
$$;

create or replace function private.current_co_member_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct them.user_id
  from public.workspace_members me
  join public.workspace_members them on them.workspace_id = me.workspace_id
  where me.user_id = (select auth.uid())::text;
$$;

-- ── Baseline hardening ─────────────────────────────────────────────────────
-- Nothing in the control plane is world-readable. RLS gates authenticated
-- users; anon gets no table grants at all.

revoke all on all tables in schema public from anon;

-- ── Workspace-scoped tables ────────────────────────────────────────────────
--
-- Every one of these carries a denormalized workspace_id precisely so the
-- policy is a flat membership test rather than a recursive join. Driven from an
-- explicit list: a loop cannot typo a table name the way 31 copy-pasted blocks
-- can, and a missing table raises instead of silently shipping without RLS.

do $$
declare
  t text;
  workspace_scoped text[] := array[
    'agent_instances', 'agent_skills', 'agents',
    'chat_messages', 'chat_sessions', 'cron_jobs',
    'goals', 'memory_contradictions', 'memory_notes', 'messages',
    'pipeline_runs', 'pipeline_steps', 'pipelines',
    'plan_edges', 'plan_nodes', 'project_directives', 'projects',
    'run_events', 'runs', 'runtime_projects', 'runtimes',
    'skill_files', 'skill_imports', 'skills',
    'task_questions', 'tasks',
    'team_members', 'team_projects', 'teams',
    'workspace_members', 'workspace_settings'
  ];
begin
  foreach t in array workspace_scoped loop
    if to_regclass('public.' || t) is null then
      raise exception 'RLS target table public.% does not exist', t;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_member_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (workspace_id in (select private.current_workspace_ids()))
         with check (workspace_id in (select private.current_workspace_ids()))',
      t || '_member_all', t
    );
  end loop;
end $$;

-- ── workspaces ─────────────────────────────────────────────────────────────
-- Scoped on `id` rather than `workspace_id`. Any authenticated user may create
-- one (becoming its owner); only admins may rename or delete it.

alter table public.workspaces enable row level security;

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces
  for select to authenticated
  using (id in (select private.current_workspace_ids()));

drop policy if exists workspaces_self_insert on public.workspaces;
create policy workspaces_self_insert on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) is not null and owner_id = (select auth.uid())::text);

drop policy if exists workspaces_admin_update on public.workspaces;
create policy workspaces_admin_update on public.workspaces
  for update to authenticated
  using (id in (select private.current_admin_workspace_ids()))
  with check (id in (select private.current_admin_workspace_ids()));

drop policy if exists workspaces_admin_delete on public.workspaces;
create policy workspaces_admin_delete on public.workspaces
  for delete to authenticated
  using (id in (select private.current_admin_workspace_ids()));

-- ── users ──────────────────────────────────────────────────────────────────
-- The one table with no workspace column. You can always see yourself, and you
-- can see people you share a workspace with — nobody else.

alter table public.users enable row level security;

drop policy if exists users_visible_read on public.users;
create policy users_visible_read on public.users
  for select to authenticated
  using (
    id = (select auth.uid())::text
    or id in (select private.current_co_member_ids())
  );

drop policy if exists users_self_insert on public.users;
create policy users_self_insert on public.users
  for insert to authenticated
  with check (id = (select auth.uid())::text);

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (id = (select auth.uid())::text)
  with check (id = (select auth.uid())::text);

-- ── daemon_tokens ──────────────────────────────────────────────────────────
-- Credentials that let a machine claim work. Admin-only, and the hash column is
-- withheld: RLS filters rows, never columns, so a `select *` by an admin would
-- otherwise hand the hash to the browser.

alter table public.daemon_tokens enable row level security;

drop policy if exists daemon_tokens_admin_all on public.daemon_tokens;
create policy daemon_tokens_admin_all on public.daemon_tokens
  for all to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()))
  with check (workspace_id in (select private.current_admin_workspace_ids()));

-- Column privileges do not override table privileges: while `authenticated`
-- holds table-level SELECT, a column-level REVOKE on token_hash is silently
-- ineffective. The table grant has to go first, then the safe columns back.
revoke select on public.daemon_tokens from authenticated;
grant select (
  id, workspace_id, runtime_id, label, last_used_at, revoked_at, created_at
) on public.daemon_tokens to authenticated;

-- ── pairing_codes ──────────────────────────────────────────────────────────
-- A readable pending code lets the reader pair a machine into the workspace, so
-- members see only the codes they minted themselves. Admins see all of them.

alter table public.pairing_codes enable row level security;

drop policy if exists pairing_codes_own_read on public.pairing_codes;
create policy pairing_codes_own_read on public.pairing_codes
  for select to authenticated
  using (
    created_by_user_id = (select auth.uid())::text
    or workspace_id in (select private.current_admin_workspace_ids())
  );

drop policy if exists pairing_codes_own_insert on public.pairing_codes;
create policy pairing_codes_own_insert on public.pairing_codes
  for insert to authenticated
  with check (
    workspace_id in (select private.current_workspace_ids())
    and created_by_user_id = (select auth.uid())::text
  );

drop policy if exists pairing_codes_own_delete on public.pairing_codes;
create policy pairing_codes_own_delete on public.pairing_codes
  for delete to authenticated
  using (
    created_by_user_id = (select auth.uid())::text
    or workspace_id in (select private.current_admin_workspace_ids())
  );

-- ── runtime_commands ───────────────────────────────────────────────────────
-- The dispatch queue. Members may read status and enqueue work; the claim/ack
-- lifecycle belongs to the daemon and happens inside SECURITY DEFINER RPCs, so
-- no general UPDATE is granted to users beyond admin intervention.

alter table public.runtime_commands enable row level security;

drop policy if exists runtime_commands_member_read on public.runtime_commands;
create policy runtime_commands_member_read on public.runtime_commands
  for select to authenticated
  using (workspace_id in (select private.current_workspace_ids()));

drop policy if exists runtime_commands_member_insert on public.runtime_commands;
create policy runtime_commands_member_insert on public.runtime_commands
  for insert to authenticated
  with check (workspace_id in (select private.current_workspace_ids()));

drop policy if exists runtime_commands_admin_update on public.runtime_commands;
create policy runtime_commands_admin_update on public.runtime_commands
  for update to authenticated
  using (workspace_id in (select private.current_admin_workspace_ids()))
  with check (workspace_id in (select private.current_admin_workspace_ids()));


-- ── 5. Realtime publication membership ─────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase Realtime publication — board-level change notifications.
--
-- These are the tables whose row changes the web UI reacts to by invalidating a
-- React Query key (see apps/web/src/components/providers.tsx). The payload is
-- only a signal; the client refetches.
--
-- Apply AFTER the drizzle migration. See ./README.md for order.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Deliberately EXCLUDED ──────────────────────────────────────────────────
--
-- run_events — live transcript deltas ride a Realtime BROADCAST channel, not
--   postgres_changes. Publishing them here would deliver every event twice and
--   spend the entire 2M message/month budget on transcripts: measured volume is
--   ~23 events per run, so the publication alone would carry the full stream
--   while the broadcast path carried it again.
--
-- system_health — no such table exists. The previous hand-written migration
--   listed it, which made the whole ALTER PUBLICATION statement fail; the UI's
--   `system_health` subscription in providers.tsx is a leftover from when core
--   pushed health over its local /ws and needs rewiring, not a publication row.
--
-- daemon_tokens, pairing_codes — credentials. Never broadcast.

do $$
declare
  t text;
  realtime_tables text[] := array[
    'runs',
    'tasks',
    'task_questions',
    'goals',
    'plan_nodes',
    'messages',
    'chat_messages',
    'chat_sessions',
    'runtimes',
    'runtime_projects',
    'memory_contradictions'
  ];
begin
  foreach t in array realtime_tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'realtime target table public.% does not exist', t;
    end if;

    -- ADD TABLE errors if the table is already published, so this is guarded
    -- to keep the script rerunnable.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Replica identity is intentionally left at DEFAULT (primary key only).
-- REPLICA IDENTITY FULL would ship every old column value on each UPDATE and
-- DELETE; the client only needs "this row changed, refetch it", so the extra
-- WAL volume and payload size would buy nothing.
