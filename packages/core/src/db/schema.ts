import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { McpServerConfig } from "@sparstrow/shared";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  role: text("role").notNull().default(""),
  systemPrompt: text("system_prompt").notNull().default(""),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  cwd: text("cwd"),
  addDirs: text("add_dirs", { mode: "json" }).$type<string[]>().notNull().default([]),
  allowedTools: text("allowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
  disallowedTools: text("disallowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
  permissionMode: text("permission_mode").notNull().default("default"),
  mcpServers: text("mcp_servers", { mode: "json" })
    .$type<Record<string, McpServerConfig>>()
    .notNull()
    .default({}),
  maxTurns: integer("max_turns"),
  memoryReadScopes: text("memory_read_scopes", { mode: "json" }).$type<string[]>().notNull().default([]),
  memoryWriteScopes: text("memory_write_scopes", { mode: "json" }).$type<string[]>().notNull().default([]),
  extraArgs: text("extra_args", { mode: "json" }).$type<string[]>().notNull().default([]),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  rootDir: text("root_dir"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    projectId: text("project_id"),
    pipelineRunId: text("pipeline_run_id"),
    pipelineStepId: text("pipeline_step_id"),
    trigger: text("trigger").notNull(),
    triggerRef: text("trigger_ref"),
    mode: text("mode").notNull(),
    prompt: text("prompt").notNull(),
    injectedContext: text("injected_context"),
    status: text("status").notNull(),
    sessionId: text("session_id"),
    lane: text("lane").notNull().default("foreground"),
    effectiveTools: text("effective_tools", { mode: "json" }).$type<string[] | null>(),
    resultText: text("result_text"),
    costUsd: real("cost_usd"),
    numTurns: integer("num_turns"),
    durationMs: integer("duration_ms"),
    pid: integer("pid"),
    exitCode: integer("exit_code"),
    error: text("error"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_runs_agent").on(t.agentId),
    index("idx_runs_status").on(t.status),
    index("idx_runs_created").on(t.createdAt),
  ],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    ts: text("ts").notNull(),
    type: text("type").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>(),
  },
  (t) => [index("idx_run_events_run").on(t.runId, t.seq)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    projectId: text("project_id"),
    status: text("status").notNull().default("inbox"),
    createdByType: text("created_by_type").notNull().default("user"),
    createdByAgentId: text("created_by_agent_id"),
    assignedAgentId: text("assigned_agent_id"),
    priority: integer("priority").notNull().default(1),
    runId: text("run_id"),
    result: text("result"),
    wakePayload: text("wake_payload"),
    userId: text("user_id"),
    dueAt: text("due_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_tasks_status").on(t.status), index("idx_tasks_assigned").on(t.assignedAgentId)],
);

export const taskQuestions = sqliteTable(
  "task_questions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    whyBlocked: text("why_blocked").notNull().default(""),
    options: text("options", { mode: "json" }).$type<string[] | null>(),
    recommendation: text("recommendation"),
    defaultIfNoAnswer: text("default_if_no_answer"),
    answer: text("answer"),
    askedByRunId: text("asked_by_run_id"),
    askedAt: text("asked_at").notNull(),
    answeredAt: text("answered_at"),
    appliedAt: text("applied_at"),
    userId: text("user_id"),
  },
  (t) => [index("idx_task_questions_queue").on(t.answeredAt, t.askedAt), index("idx_task_questions_task").on(t.taskId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    fromType: text("from_type").notNull(),
    fromAgentId: text("from_agent_id"),
    toAgentId: text("to_agent_id"),
    projectId: text("project_id"),
    taskId: text("task_id"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    status: text("status").notNull().default("unread"),
    spawnedRunId: text("spawned_run_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_messages_to").on(t.toAgentId, t.status)],
);

export const pipelines = sqliteTable("pipelines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  projectId: text("project_id"),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const pipelineSteps = sqliteTable(
  "pipeline_steps",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id").notNull(),
    position: integer("position").notNull(),
    agentId: text("agent_id").notNull(),
    promptTemplate: text("prompt_template").notNull(),
    onFailure: text("on_failure").notNull().default("abort"),
  },
  (t) => [index("idx_pipeline_steps_pipeline").on(t.pipelineId, t.position)],
);

export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  pipelineId: text("pipeline_id").notNull(),
  status: text("status").notNull(),
  trigger: text("trigger").notNull(),
  triggerPrompt: text("trigger_prompt"),
  currentStep: integer("current_step").notNull().default(0),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const cronJobs = sqliteTable("cron_jobs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cronExpr: text("cron_expr").notNull(),
  timezone: text("timezone").notNull().default("system"),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  prompt: text("prompt").notNull(),
  projectId: text("project_id"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const memoryNotes = sqliteTable(
  "memory_notes",
  {
    id: text("id").primaryKey(),
    path: text("path").notNull().unique(),
    scope: text("scope").notNull(),
    projectSlug: text("project_slug"),
    agentSlug: text("agent_slug"),
    title: text("title").notNull().default(""),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    source: text("source").notNull().default("user"),
    contentHash: text("content_hash").notNull().default(""),
    indexedAt: text("indexed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_memory_notes_scope").on(t.scope, t.projectSlug, t.agentSlug)],
);

export const memoryChunks = sqliteTable(
  "memory_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    noteId: text("note_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    text: text("text").notNull(),
    heading: text("heading"),
  },
  (t) => [index("idx_memory_chunks_note").on(t.noteId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const teamProjects = sqliteTable(
  "team_projects",
  {
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.projectId] })],
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    teamRole: text("team_role"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("idx_team_members_team").on(t.teamId, t.sort)],
);
