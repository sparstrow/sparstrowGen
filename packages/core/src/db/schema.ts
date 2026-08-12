import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AppliedEffect, McpServerConfig, SpecterReport } from "@sparstrow/shared";

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
  // P5: per-agent signal-extraction toggle — when false, the nightly dream-cycle
  // signal pass skips this agent's transcripts.
  signalExtraction: integer("signal_extraction", { mode: "boolean" }).notNull().default(true),
  // P4: factory-managed system agent (Project Indexer/Reporter), hidden from the
  // default roster. Seeded at boot, not user-created.
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  // P9: provenance ('user' | 'import') + quarantine lifecycle
  // ('active' | 'quarantined' | 'discarded'). Imported skills land quarantined
  // (enabled=false, no tool grants) until the operator promotes them; enums in zod.
  origin: text("origin").notNull().default("user"),
  status: text("status").notNull().default("active"),
  // P9 Skill Specter security review card (pass/flag/block + findings), JSON.
  specterReport: text("specter_report", { mode: "json" }).$type<SpecterReport | null>(),
  // P9 code-enforced links (no FK — audit rows survive sandbox cleanup): the
  // import batch and the sandbox project this skill was extracted from.
  importId: text("import_id"),
  sandboxProjectId: text("sandbox_project_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("idx_agents_status").on(t.status)]);

/**
 * P9 skill ingestion (§3): one row per external-repo import. Core clones the
 * repo into a sandbox project, the Intelligence Extractor reconstructs skills as
 * quarantined draft agents, and the Skill Specter reviews each. Links are
 * code-enforced (no FK) so the audit row survives sandbox cleanup.
 */
export const skillImports = sqliteTable(
  "skill_imports",
  {
    id: text("id").primaryKey(),
    sourceUrl: text("source_url").notNull(),
    sandboxProjectId: text("sandbox_project_id"),
    status: text("status").notNull().default("cloning"),
    extractorRunId: text("extractor_run_id"),
    error: text("error"),
    foundSkillCount: integer("found_skill_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_skill_imports_status").on(t.status)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull().default(""),
    rootDir: text("root_dir"),
    allowedTools: text("allowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
    disallowedTools: text("disallowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
    // P4 client variants (§7): self-reference to the base project. Code-enforced FK
    // (SQLite ADD COLUMN can't add one) — mirrors tasks.parent_task_id.
    parentProjectId: text("parent_project_id"),
    // P4 sandbox (§6/EH7): sandboxed runs may only write memory scoped to this
    // project; its notes are non-global-searchable.
    isSandbox: integer("is_sandbox", { mode: "boolean" }).notNull().default(false),
    // P4 git awareness: the remote this rootDir was cloned/bound from (nullable).
    gitRemote: text("git_remote"),
    // P7 execution profile (factory | production_app): decides the git-ops guard
    // rails (PR target + protected refs). Enum enforced in zod, not SQL.
    executionProfile: text("execution_profile").notNull().default("factory"),
    // P7: the protected staging branch a production_app project PRs into.
    stagingBranch: text("staging_branch"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_projects_parent").on(t.parentProjectId)],
);

/**
 * P4 project directives (§2/P4-Q2): ordered, toggleable operator rules PREPENDED
 * (guaranteed-injection, never token-trimmed) into every run in the project.
 */
export const projectDirectives = sqliteTable(
  "project_directives",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sort: integer("sort").notNull().default(0),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("idx_project_directives_project").on(t.projectId, t.sort)],
);

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
    // E1 (P5): structured provenance of what the injector actually put into the
    // prompt (post budget-trim). NOT named injected_context — that column already
    // means the rendered <memory> block string (plan L158-160 naming landmine).
    injectedMemory: text("injected_memory", { mode: "json" }).$type<{
      notes: Array<{
        id: string;
        path: string;
        title: string;
        scope: string;
        projectSlug: string | null;
        agentSlug: string | null;
        source: string;
        type: string;
      }>;
      directives: Array<{ id: string; body: string }>;
    } | null>(),
    // EH6/EH7 (P5): the run consumed untrusted/external content (sandbox project,
    // delegated task, or external-content tool use). Stamped at finalize; signal
    // notes extracted from such runs are quarantined.
    untrusted: integer("untrusted", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull(),
    sessionId: text("session_id"),
    lane: text("lane").notNull().default("foreground"),
    // P3/EH4: the project-scoped instance this run executed as (null = template).
    agentInstanceId: text("agent_instance_id"),
    effectiveTools: text("effective_tools", { mode: "json" }).$type<{
      allowed: string[];
      disallowed: string[];
    } | null>(),
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
    allowedTools: text("allowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
    disallowedTools: text("disallowed_tools", { mode: "json" }).$type<string[]>().notNull().default([]),
    // P3 delegation tree (self-FK; not declared as a drizzle FK to keep the
    // ALTER TABLE migration simple — SQLite ADD COLUMN can't add one anyway).
    parentTaskId: text("parent_task_id"),
    // P3 S1-a: the delegating parent run's effective toolset, snapshotted at
    // spawn_subtask time. Child-run resolution is intersected with this bound.
    parentEffectiveTools: text("parent_effective_tools", { mode: "json" }).$type<{
      allowed: string[];
      disallowed: string[];
    } | null>(),
    userId: text("user_id"),
    teamId: text("team_id"),
    dueAt: text("due_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_tasks_status").on(t.status),
    index("idx_tasks_assigned").on(t.assignedAgentId),
    index("idx_tasks_parent").on(t.parentTaskId),
    index("idx_tasks_team").on(t.teamId),
  ],
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

/**
 * Unified session-chat architecture (intake 0001+0002): one session row per
 * conversation across every chat surface (free / project / agent /
 * agent-creator). project_id/agent_id are code-enforced FKs (nullable by kind).
 * `draft` is the Agent Creator's accumulated clamped AgentDraft (JSON).
 */
export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull().default(""),
    projectId: text("project_id"),
    agentId: text("agent_id"),
    provider: text("provider"),
    model: text("model"),
    status: text("status").notNull().default("active"),
    draft: text("draft", { mode: "json" }).$type<Record<string, unknown> | null>(),
    lastMessageAt: text("last_message_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_chat_sessions_kind").on(t.kind, t.status),
    index("idx_chat_sessions_project").on(t.projectId),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown> | null>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_chat_messages_session").on(t.sessionId, t.createdAt)],
);

export const pipelines = sqliteTable("pipelines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  projectId: text("project_id"),
  teamId: text("team_id"),
  description: text("description").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("idx_pipelines_team").on(t.teamId)]);

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
  teamId: text("team_id"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  nextRunAt: text("next_run_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("idx_cron_jobs_team").on(t.teamId)]);

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
    // P5 typed memory: note|decision|architecture|pitfall|meeting|lesson.
    // Enum enforced in zod (shared memoryNoteTypeSchema), not SQL.
    type: text("type").notNull().default("note"),
    // EH6: non-injectable and invisible to agent reads until owner approval.
    quarantined: integer("quarantined", { mode: "boolean" }).notNull().default(false),
    // P5 dream cycle soft-archive: merged originals are archived (never deleted)
    // and point at the synthesis note that replaced them.
    archivedAt: text("archived_at"),
    supersededBy: text("superseded_by"),
    contentHash: text("content_hash").notNull().default(""),
    indexedAt: text("indexed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_memory_notes_scope").on(t.scope, t.projectSlug, t.agentSlug),
    index("idx_memory_notes_type").on(t.type),
  ],
);

/**
 * P5 wikilinks: `[[Note Title]]` edges extracted at index time — hard edges,
 * no LLM cost. `unresolvedTitle` always holds the raw link text (even when
 * resolved) so a dangling link re-resolves when a matching note appears and a
 * resolved link survives its target's deletion as dangling-again.
 */
export const memoryLinks = sqliteTable(
  "memory_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromNoteId: text("from_note_id")
      .notNull()
      .references(() => memoryNotes.id, { onDelete: "cascade" }),
    toNoteId: text("to_note_id"),
    unresolvedTitle: text("unresolved_title").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_memory_links_from").on(t.fromNoteId),
    index("idx_memory_links_to").on(t.toNoteId),
  ],
);

/**
 * P5 dream cycle contradiction flags (P5-Q3: FLAG-ONLY, no auto-resolve).
 * Surfaced as `contradiction` rows in the P1 Attention queue; the owner
 * resolves by editing/archiving notes themselves and dismissing the flag.
 * (noteA, noteB) is stored id-ordered so a pair can't be flagged twice.
 */
export const memoryContradictions = sqliteTable(
  "memory_contradictions",
  {
    id: text("id").primaryKey(),
    projectSlug: text("project_slug"),
    noteA: text("note_a").notNull(),
    noteB: text("note_b").notNull(),
    axis: text("axis").notNull().default(""),
    severity: text("severity").notNull().default("low"),
    confidence: real("confidence").notNull().default(0),
    detectedAt: text("detected_at").notNull(),
    resolvedAt: text("resolved_at"),
    resolution: text("resolution"),
  },
  (t) => [
    index("idx_memory_contradictions_open").on(t.resolvedAt),
    uniqueIndex("uq_memory_contradictions_pair").on(t.noteA, t.noteB),
  ],
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

/**
 * Workspace skills: reusable instruction packs (Markdown) assignable to agents.
 * Assigned + enabled skills are injected into the agent's run prompt as a
 * guaranteed block (see agents/agent-skills.ts).
 */
export const skills = sqliteTable("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  content: text("content").notNull().default(""),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  // Origin provenance (detail page's Origin panel): manual | url | runtime,
  // plus the source path/URL and, for runtime copies, the provider.
  sourceType: text("source_type").notNull().default("manual"),
  sourceRef: text("source_ref"),
  sourceProvider: text("source_provider"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Supporting files bundled with a skill (relative path → text content). */
export const skillFiles = sqliteTable(
  "skill_files",
  {
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
  },
  (t) => [primaryKey({ columns: [t.skillId, t.path] })],
);

export const agentSkills = sqliteTable(
  "agent_skills",
  {
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agentId, t.skillId] })],
);

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  // P3 ephemeral teams: auto-created around a multi-assign task; soft-archived
  // (C6/P3-Q3 — never hard-deleted) when the linked task reaches terminal status.
  isEphemeral: integer("is_ephemeral", { mode: "boolean" }).notNull().default(false),
  linkedTaskId: text("linked_task_id"),
  archivedAt: text("archived_at"),
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

/**
 * P3 agent instances (locked D5): (template, project) deployments, created lazily
 * on the first run of a template inside a project. `agent:self` memory resolves to
 * the instance; busy-tracking keys on it (P3-Q5). Templates stay the org-level
 * identity everywhere else — see docs/archive/fable-handoff/P3-SEAM-TABLE.md.
 */
export const agentInstances = sqliteTable(
  "agent_instances",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("uq_agent_instances_agent_project").on(t.agentId, t.projectId)],
);

/**
 * P6 goals (engine: LLM-planned-DAG per the P6-Q0 head-to-head). `paused` is a
 * flag, not a status; `pending_replan_reason` is the row-recoverable replan
 * barrier; `world_state` is the version-stamped applied-effects AUDIT trail
 * (annotation, never control flow — readiness derives from edges + tasks).
 */
export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    // No FK (tasks.project_id precedent): a goal survives its project/team row.
    projectId: text("project_id"),
    teamId: text("team_id"),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("planning"),
    planVersion: integer("plan_version").notNull().default(0),
    replanCount: integer("replan_count").notNull().default(0),
    consensus: text("consensus").notNull().default("auto"),
    paused: integer("paused", { mode: "boolean" }).notNull().default(false),
    pendingReplanReason: text("pending_replan_reason"),
    blockedReason: text("blocked_reason"),
    planSummary: text("plan_summary"),
    plannerRunId: text("planner_run_id"),
    plannerAttempts: integer("planner_attempts").notNull().default(0),
    // P6-Q3 consensus gate: the in-flight Reviewer run, and the plan version the
    // Reviewer last approved (a replan invalidates approval — version mismatch).
    consensusRunId: text("consensus_run_id"),
    consensusApprovedVersion: integer("consensus_approved_version"),
    worldState: text("world_state", { mode: "json" }).$type<AppliedEffect[]>().notNull().default([]),
    versionLog: text("version_log", { mode: "json" })
      .$type<Array<{ planVersion: number; reason: string; at: string; nodeCount: number }>>()
      .notNull()
      .default([]),
    userId: text("user_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("idx_goals_project").on(t.projectId),
    index("idx_goals_status").on(t.status),
    index("idx_goals_user").on(t.userId),
  ],
);

/**
 * P6 plan nodes. NO status column (EM4 — derived from the linked task);
 * `action_id` is the stable cross-version identity (replan diffing +
 * completion carry-forward); only rows matching goals.plan_version execute.
 */
export const planNodes = sqliteTable(
  "plan_nodes",
  {
    id: text("id").primaryKey(),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    planVersion: integer("plan_version").notNull(),
    actionId: text("action_id").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    agentHint: text("agent_hint"),
    // Resolved assignee — no FK so agent deletion mid-goal isn't blocked;
    // materialization re-checks the row exists (startTaskRun precedent).
    agentId: text("agent_id"),
    kind: text("kind").notNull().default("work"),
    pre: text("pre", { mode: "json" }).$type<string[]>().notNull().default([]),
    effects: text("effects", { mode: "json" }).$type<string[]>().notNull().default([]),
    cost: real("cost").notNull().default(1),
    // No FK: tasks are deletable independently; reconciliation treats a
    // vanished task as node failure.
    taskId: text("task_id"),
    position: text("position", { mode: "json" }).$type<{ x: number; y: number } | null>(),
    userId: text("user_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("idx_plan_nodes_goal").on(t.goalId, t.planVersion),
    index("idx_plan_nodes_task").on(t.taskId),
    index("idx_plan_nodes_user").on(t.userId),
    uniqueIndex("uq_plan_nodes_goal_version_action").on(t.goalId, t.planVersion, t.actionId),
  ],
);

/** P6 plan edges — AUTHORITATIVE dependencies (P6-Q0), recomputed only by plan writes. */
export const planEdges = sqliteTable(
  "plan_edges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    planVersion: integer("plan_version").notNull(),
    fromNodeId: text("from_node_id")
      .notNull()
      .references(() => planNodes.id, { onDelete: "cascade" }),
    toNodeId: text("to_node_id")
      .notNull()
      .references(() => planNodes.id, { onDelete: "cascade" }),
    userId: text("user_id"),
  },
  (t) => [
    index("idx_plan_edges_goal").on(t.goalId, t.planVersion),
    index("idx_plan_edges_to").on(t.toNodeId),
    index("idx_plan_edges_user").on(t.userId),
  ],
);

/**
 * M4 — cloud id ↔ local id, for rows that already existed on both sides.
 *
 * The control plane is the board and this database is what the runner reads.
 * Agents and projects exist in both, with independent ids and no definition
 * sync (D-9), so a `run.start` command naming a cloud agent has to be resolved
 * to a local one before anything can spawn.
 *
 * Resolution is by SLUG the first time and by this table every time after.
 * Adopting the cloud id instead would mean rewriting a live primary key that
 * `runs.agent_id` and `tasks.assigned_agent_id` point at, or inserting a second
 * row that violates the UNIQUE on slug.
 *
 * Runs deliberately do NOT appear here: a dispatched run is created with the
 * cloud's id directly, because it is a new row with nothing to collide with.
 */
export const cloudLinks = sqliteTable(
  "cloud_links",
  {
    /** `agent` | `project`. */
    kind: text("kind").notNull(),
    cloudId: text("cloud_id").notNull(),
    localId: text("local_id").notNull(),
    linkedAt: text("linked_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.kind, t.cloudId] }),
    uniqueIndex("uq_cloud_links_local").on(t.kind, t.localId),
  ],
);

/**
 * M5 — how far a run's transcript has actually landed in the cloud.
 *
 * Not a buffer: `run_events` already IS the durable copy, written before the
 * bus ever publishes (`recordEvent`, `run-manager.ts`). This is a cursor into
 * that table — "everything with `seq > pushedThroughSeq` for this run has not
 * been confirmed durable in Postgres yet" — which is what turns a 60-second
 * network blip, a process crash, and a laptop that was shut for a week into the
 * SAME query: `select … from run_events where run_id = ? and seq > ? order by
 * seq`.
 *
 * `pushedThroughSeq` only ever advances from the SERVER's `storedThroughSeq` in
 * an ingest response — never from what the daemon believes it sent. Advancing
 * optimistically is how a transcript acquires a permanent hole.
 *
 * A row here does not mean "this run is in trouble". It means "this run has
 * something outstanding" — every run gets one the instant its first event is
 * confirmed, and it disappears once the run is BOTH terminal AND fully pushed.
 * What survives past that is the backlog `T-M5-04`'s staleness ceiling bounds.
 */
export const cloudEventCursors = sqliteTable(
  "cloud_event_cursors",
  {
    runId: text("run_id").primaryKey(),
    pushedThroughSeq: integer("pushed_through_seq").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  // The backfill sweep orders and range-queries on this column (oldest first
  // for both the age and count ceilings) — bounded to ~200 rows by
  // TRANSCRIPT_BACKLOG_MAX_RUNS, so this is cheap insurance more than a
  // measured necessity.
  (t) => [index("idx_cloud_event_cursors_updated").on(t.updatedAt)],
);
