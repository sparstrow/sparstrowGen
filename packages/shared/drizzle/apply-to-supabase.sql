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
--           6 person-scoped machine credentials (2026-09-02)
--
-- Section 6 is APPENDED rather than folded into sections 1-5 on purpose. It is
-- migrations 0011 and 0012 plus policies/033, in the exact order a real deploy
-- applies them, so a fresh database ends in the same state as an upgraded one.
-- Folding it in would mean hand-editing sections 1 and 4 to remove tables that
-- 0012 drops -- a rewrite of a working file, verified against nothing, to make
-- the intermediate state prettier. The cost is that `daemon_tokens` and
-- `pairing_attempts` are created in section 1 and dropped again in section 6.
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
	-- "hitl_approved" removed 2026-09-02: this bundle builds a FRESH database,
	-- and a fresh database should never gain a column that migration 0013 exists
	-- to drop. Existing databases still need 0013. See doc/Deferred.md D-1.
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


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Person-scoped machine credentials (2026-09-02)
--
-- A machine's credential moved from {one workspace, one runtime} to the
-- person who owns the machine. See
-- doc/plans/2026-09-02-computers-that-are-just-there.md and
-- doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md.
--
-- Verbatim: drizzle/0011, drizzle/0012, policies/033.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 6a. migration 0011 ─────────────────────────────────────────────────────
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

ALTER TABLE "runtimes" ADD COLUMN "machine_id" text;
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "idx_access_tokens_user" ON "access_tokens" USING btree ("user_id","revoked_at");
CREATE INDEX "idx_access_tokens_machine" ON "access_tokens" USING btree ("machine_id");
CREATE INDEX "idx_connect_attempts_status_expires" ON "connect_attempts" USING btree ("status","expires_at");
CREATE INDEX "idx_machines_user" ON "machines" USING btree ("user_id");
ALTER TABLE "runtimes" ADD CONSTRAINT "runtimes_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;
CREATE INDEX "idx_runtimes_machine" ON "runtimes" USING btree ("machine_id");
CREATE UNIQUE INDEX "uq_runtimes_machine_workspace" ON "runtimes" USING btree ("machine_id","workspace_id");

-- ── 6b. migration 0012 ─────────────────────────────────────────────────────
--
-- `IF EXISTS` added 2026-09-02, and it fixed a bundle that could not run.
--
-- These four statements replay migration 0012, which dropped two legacy
-- tables. But section 1 is regenerated from the current schema, and the
-- current schema no longer contains `pairing_attempts` (it became
-- `connect_attempts`), so section 1 stopped creating it while section 6b went
-- on trying to drop it. The two halves of this file disagreed, and the
-- unconditional `ALTER TABLE "pairing_attempts"` aborted the whole run at this
-- line — after 39 tables, before RLS and realtime.
--
-- That means **a fresh deploy from this bundle has been broken**, and nobody
-- noticed because no fresh deploy has been done since the rename. It was found
-- by pointing local Docker Supabase at this file. `daemon_tokens` is still
-- created by section 1, so it still genuinely needs dropping here — which is
-- why the fix is to tolerate absence rather than to delete these lines.
--
-- Keep `IF EXISTS` on any statement in sections 5-6 that names a table section
-- 1 might legitimately stop creating. Section 1 tracks the schema; these
-- sections track history, and history does not get to assume the schema.
ALTER TABLE IF EXISTS "daemon_tokens" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "pairing_attempts" DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS "daemon_tokens" CASCADE;
DROP TABLE IF EXISTS "pairing_attempts" CASCADE;
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
WHERE r."machine_id" IS NULL;
UPDATE "runtimes" SET "machine_id" = 'legacy_' || "id" WHERE "machine_id" IS NULL;
ALTER TABLE "runtimes" ALTER COLUMN "machine_id" SET NOT NULL;

-- ── 6c. policies/033 ───────────────────────────────────────────────────────
-- 033_machines_and_access_tokens.sql
--
-- The machine credential moves from {one workspace, one runtime} to the PERSON
-- who owns the machine. doc/specs/2026-09-02-computers-that-are-just-there.md
-- and doc/plans/2026-09-02-computers-that-are-just-there.md have the design;
-- doc/security/SEC-2026-09-02-daemon-credential-widened-to-person-scope.md has
-- the trust-boundary change this represents and the controls it depends on.
-- Read that one before loosening anything here.
--
-- Supersedes 031 (pairing_attempts) and 008's descendants entirely. Both of
-- those tables are dropped by migration 0012; their policies and functions go
-- with them at the bottom of this file.
--
-- Two tables, two postures:
--
--   machines       — owner-only. Nobody else needs to read it: everything a
--                    workspace member sees about a computer already lives on
--                    the workspace-scoped `runtimes` row, so granting members
--                    read here would widen exposure for no feature.
--
--   access_tokens  — owner-only AND column-restricted. `token_hash` is never
--                    granted to `authenticated` at all (same posture the
--                    dropped daemon_tokens had): RLS is row-level, so keeping
--                    the hash unreadable is a GRANT problem, not a policy one.

-- ── machines ────────────────────────────────────────────────────────────────
--
-- `(select auth.uid())` rather than a bare `auth.uid()`, per the InitPlan rule
-- in 001's header: wrapped, it is evaluated once per query instead of once per
-- row.
--
-- No insert or update policy for `authenticated`. Rows here are written only by
-- `claim_machine` below, which runs as definer. A signed-in user able to insert
-- a machine row directly could fabricate a computer they do not have, and a
-- user able to UPDATE one could re-point `user_id` at somebody else.

alter table public.machines enable row level security;

drop policy if exists machines_owner_read on public.machines;
create policy machines_owner_read on public.machines
  for select to authenticated
  using (user_id = (select auth.uid())::text);

-- Renaming is the one field a person edits by hand, so it gets the one write
-- policy — narrowed by WITH CHECK to rows that stay theirs.
drop policy if exists machines_owner_rename on public.machines;
create policy machines_owner_rename on public.machines
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists machines_owner_delete on public.machines;
create policy machines_owner_delete on public.machines
  for delete to authenticated
  using (user_id = (select auth.uid())::text);

-- ── access_tokens ───────────────────────────────────────────────────────────
--
-- INSERT is allowed for `authenticated` deliberately, unlike machines: minting
-- a token for yourself is exactly what the Settings -> API Tokens page and the
-- desktop claim flow do, and both run as the signed-in user. The WITH CHECK is
-- what keeps it honest — you may only ever create a token that acts as you.
--
-- The raw token is generated in Node (32 bytes of CSPRNG) and only its sha256
-- reaches the database, so "insert" here never means "the database chose a
-- credential".

alter table public.access_tokens enable row level security;

drop policy if exists access_tokens_owner_read on public.access_tokens;
create policy access_tokens_owner_read on public.access_tokens
  for select to authenticated
  using (user_id = (select auth.uid())::text);

drop policy if exists access_tokens_owner_insert on public.access_tokens;
create policy access_tokens_owner_insert on public.access_tokens
  for insert to authenticated
  with check (
    user_id = (select auth.uid())::text
    -- ...and bound to one of YOUR machines, or to none yet. Without this
    -- second clause, a member of a shared workspace could mint a token naming
    -- somebody else's machine_id; `resolveRuntimeScope` would then match that
    -- machine against a runtime in the workspace they legitimately share, and
    -- they would be impersonating a computer that is not theirs. The token
    -- still acts as them, which is why this is narrow rather than critical —
    -- but narrow is not the same as closed.
    and (
      machine_id is null
      or machine_id in (
        select m.id from public.machines m
        where m.user_id = (select auth.uid())::text
      )
    )
  );

-- Revocation is an UPDATE of `revoked_at`, not a DELETE: a revoked row is the
-- record that something HAD access and no longer does, which is most of what
-- the tokens page is for. Deleting it would erase the audit trail at exactly
-- the moment it becomes interesting.
drop policy if exists access_tokens_owner_revoke on public.access_tokens;
create policy access_tokens_owner_revoke on public.access_tokens
  for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- Column grants. `token_hash` is absent from both lists on purpose — it is
-- readable only by the service role, which is the only thing that ever needs
-- to match one. Re-granting it here would make every signed-in session able to
-- read the verifier for its own machines' credentials.
revoke select on public.access_tokens from authenticated;
grant select (
  id, user_id, machine_id, name, last_used_at, revoked_at, created_at
) on public.access_tokens to authenticated;

revoke insert on public.access_tokens from authenticated;
grant insert (
  id, user_id, machine_id, name, token_hash, created_at
) on public.access_tokens to authenticated;

revoke update on public.access_tokens from authenticated;
grant update (revoked_at, name) on public.access_tokens to authenticated;

-- ── connect_attempts ────────────────────────────────────────────────────────
--
-- Carried over from 031 with one change: no workspace is chosen. A machine
-- belongs to a person and reaches every workspace that person is in, so the
-- approval step records WHO approved and nothing else.
--
-- The second disjunct in the read policy is not decoration. It was found by
-- running the real flow: PostgREST compiles `.update().select()` into
-- `UPDATE ... RETURNING`, and that re-select is gated by the SELECT policy,
-- not the UPDATE policy's WITH CHECK. Without it, flipping `status` to
-- 'approved' makes the row stop matching `status = 'pending'`, the re-select
-- returns nothing, and Postgres reports 42501 "new row violates row level
-- security policy" — indistinguishable from a real WITH CHECK failure until
-- you trace it. Scoped to the approver so it only ever reveals the row that
-- person just approved.

alter table public.connect_attempts enable row level security;

drop policy if exists connect_attempts_pending_read on public.connect_attempts;
create policy connect_attempts_pending_read on public.connect_attempts
  for select to authenticated
  using (
    (status = 'pending' and expires_at > pg_catalog.now())
    or (status = 'approved' and approved_by_user_id = (select auth.uid())::text)
  );

drop policy if exists connect_attempts_approve on public.connect_attempts;
create policy connect_attempts_approve on public.connect_attempts
  for update to authenticated
  using (status = 'pending' and expires_at > pg_catalog.now())
  with check (
    status = 'approved'
    and approved_by_user_id = (select auth.uid())::text
  );

-- ── claim_machine: the whole of "this computer is mine" ─────────────────────
--
-- SECURITY DEFINER and service-role-only, for the same reason 004/031's RPCs
-- are: this is four-to-six statements that must land together or not at all.
-- A partial application would leave a machine row with no runtimes (invisible
-- and unusable) or runtimes in a workspace the caller has since left.
--
-- Called by POST /api/daemon/claim AFTER that route has verified the bearer
-- token and resolved it to `p_user_id`. The user id is therefore server-
-- asserted, never client-supplied — the same invariant `daemon/auth.ts`'s
-- banner states for workspace ids, applied to the identity that replaced it.
--
-- What it does, in order:
--   1. upsert the machine, moving `user_id` if a different person signed in
--   2. if the owner CHANGED, drop every runtime the machine had — the previous
--      owner's workspaces must not keep an entry that now answers to somebody
--      else (spec FR-004)
--   3. upsert one runtime per workspace the new owner belongs to
--   4. delete runtimes in workspaces they are no longer a member of
--
-- Step 4 is what stops a machine keeping a presence in a workspace after the
-- person left it. Without it, leaving a workspace would silently leave an
-- executable runtime behind in it.

create or replace function public.claim_machine(
  p_machine_id    text,
  p_user_id       text,
  p_name          text,
  p_os            text,
  p_hostname      text,
  p_is_electron   boolean,
  p_capabilities  jsonb,
  p_core_version  text,
  p_token_id      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_user text;
  v_result        jsonb;
begin
  if p_machine_id is null or p_user_id is null then
    raise exception 'machine id and user id are both required' using errcode = 'SCM00';
  end if;

  select m.user_id into v_previous_user
  from public.machines m
  where m.id = p_machine_id
  for update;

  -- `name` is set on insert only. A machine renamed in the UI must not have
  -- that name stomped by the next claim — the same reasoning the register
  -- route already applies to `runtimes.name`.
  insert into public.machines (
    id, user_id, name, os, hostname, is_electron, core_version, last_seen_at
  )
  values (
    p_machine_id,
    p_user_id,
    coalesce(nullif(p_name, ''), nullif(p_hostname, ''), 'Unnamed computer'),
    coalesce(nullif(p_os, ''), 'unknown'),
    coalesce(nullif(p_hostname, ''), 'unknown'),
    coalesce(p_is_electron, false),
    nullif(p_core_version, ''),
    pg_catalog.now()
  )
  on conflict (id) do update set
    user_id      = excluded.user_id,
    os           = excluded.os,
    hostname     = excluded.hostname,
    is_electron  = excluded.is_electron,
    core_version = excluded.core_version,
    last_seen_at = pg_catalog.now();

  -- A different person signed in on this computer. Everything the previous
  -- owner's workspaces knew about it goes, before anything new is written.
  if v_previous_user is not null and v_previous_user is distinct from p_user_id then
    delete from public.runtimes where machine_id = p_machine_id;
  end if;

  -- One runtime per workspace this person belongs to. The id is derived, not
  -- random, so a re-claim lands on the same row even if the unique index were
  -- ever rebuilt.
  insert into public.runtimes (
    id, workspace_id, machine_id, name, os, hostname, is_electron,
    capabilities, status, core_version, last_heartbeat
  )
  select
    p_machine_id || '_' || wm.workspace_id,
    wm.workspace_id,
    p_machine_id,
    coalesce(nullif(p_name, ''), nullif(p_hostname, ''), 'Unnamed computer'),
    coalesce(nullif(p_os, ''), 'unknown'),
    coalesce(nullif(p_hostname, ''), 'unknown'),
    coalesce(p_is_electron, false),
    coalesce(p_capabilities, '[]'::jsonb),
    'online',
    nullif(p_core_version, ''),
    pg_catalog.now()
  from public.workspace_members wm
  where wm.user_id = p_user_id
  on conflict (machine_id, workspace_id) do update set
    os             = excluded.os,
    hostname       = excluded.hostname,
    is_electron    = excluded.is_electron,
    capabilities   = excluded.capabilities,
    status         = 'online',
    core_version   = excluded.core_version,
    last_heartbeat = pg_catalog.now();

  -- Workspaces this person has left keep no runtime for this machine.
  delete from public.runtimes r
  where r.machine_id = p_machine_id
    and not exists (
      select 1 from public.workspace_members wm
      where wm.user_id = p_user_id and wm.workspace_id = r.workspace_id
    );

  -- Adopt the credential that made this call. A token created by hand on the
  -- tokens page starts with no machine (there was no machine yet when it was
  -- typed); this is where it learns which computer used it, so the tokens page
  -- can say "Sparstrow Desktop - DESKTOP-GJ8NLB8" instead of leaving a row
  -- that names no machine forever.
  if p_token_id is not null then
    update public.access_tokens
    set machine_id = p_machine_id
    where id = p_token_id
      and user_id = p_user_id
      and machine_id is distinct from p_machine_id;
  end if;

  select jsonb_build_object(
    'machineId', p_machine_id,
    'runtimes', coalesce(
      jsonb_agg(jsonb_build_object('runtimeId', r.id, 'workspaceId', r.workspace_id)),
      '[]'::jsonb
    )
  )
  into v_result
  from public.runtimes r
  where r.machine_id = p_machine_id;

  return v_result;
end;
$$;

revoke all on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) from public;
revoke all on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) from anon;
revoke all on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) from authenticated;
grant execute on function public.claim_machine(text, text, text, text, text, boolean, jsonb, text, text) to service_role;

-- The 8-argument shape existed briefly during development; drop it so two
-- overloads can never both be resolvable.
drop function if exists public.claim_machine(text, text, text, text, text, boolean, jsonb, text);

-- ── exchange_connect_attempt: where a remote machine's token is minted ──────
--
-- Same two-phase shape 031 established and for the same reason: the credential
-- is minted at CONSUME, not at approval, so it only exists once the browser's
-- redirect has already reached the machine's own loopback listener. A machine
-- that never came back never got a token.
--
-- Unlike 031's version this mints an access_token for the APPROVING PERSON and
-- creates no runtime — the machine calls claim_machine itself immediately
-- afterwards, with the credential it just received. Splitting those keeps one
-- claim path rather than two that can drift.
--
-- `select ... for update` without filtering on status, matching 031: filtering
-- would make the loser of a race see zero rows and report "unknown attempt"
-- for a request that was merely late, instead of the "already consumed" it
-- should report.

create or replace function public.exchange_connect_attempt(
  p_attempt_id  text,
  p_token_hash  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.connect_attempts%rowtype;
  v_token_id text;
begin
  if p_attempt_id is null or p_token_hash is null then
    raise exception 'attempt id and token hash are both required' using errcode = 'SCA00';
  end if;

  select * into v_attempt
  from public.connect_attempts a
  where a.id = p_attempt_id
  for update;

  if not found then
    raise exception 'That connection attempt is not valid.' using errcode = 'SCA01';
  end if;

  if v_attempt.status = 'pending' then
    raise exception 'That connection attempt has not been approved yet.' using errcode = 'SCA02';
  end if;

  if v_attempt.status = 'consumed' then
    raise exception 'That connection attempt has already been used.' using errcode = 'SCA03';
  end if;

  -- The database clock, never a caller-supplied timestamp: a machine with a
  -- skewed clock must not decide for itself whether its own attempt expired.
  if v_attempt.expires_at <= pg_catalog.now() then
    raise exception 'That connection attempt has expired.' using errcode = 'SCA04';
  end if;

  v_token_id := pg_catalog.gen_random_uuid()::text;

  insert into public.access_tokens (id, user_id, machine_id, name, token_hash)
  values (
    v_token_id,
    v_attempt.approved_by_user_id,
    null,  -- adopted by claim_machine on the machine's first call
    coalesce(nullif(v_attempt.hostname, ''), 'Connected computer'),
    p_token_hash
  );

  update public.connect_attempts
  set status = 'consumed', consumed_at = pg_catalog.now()
  where id = p_attempt_id;

  return jsonb_build_object(
    'tokenId', v_token_id,
    'userId', v_attempt.approved_by_user_id,
    'machineId', v_attempt.machine_id
  );
end;
$$;

revoke all on function public.exchange_connect_attempt(text, text) from public;
revoke all on function public.exchange_connect_attempt(text, text) from anon;
revoke all on function public.exchange_connect_attempt(text, text) from authenticated;
grant execute on function public.exchange_connect_attempt(text, text) to service_role;

-- ── Retire 031 ──────────────────────────────────────────────────────────────
--
-- Migration 0012 drops `pairing_attempts` and `daemon_tokens` with CASCADE,
-- which takes their policies with them. The function is not attached to either
-- table and would survive as a live, service-role-executable entry point that
-- references tables that no longer exist — so it is dropped explicitly.

drop function if exists public.exchange_pairing_attempt(text, text);

