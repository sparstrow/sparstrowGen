import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";

// ─── 1. Workspaces & Team Members ──────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default(""),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"), // "owner" | "admin" | "member"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_workspace_members_user").on(t.userId, t.workspaceId)]
);

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Matches Supabase Auth user.id
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("developer"), // "admin" | "developer" | "viewer"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── 2. Daemon Node Registry ───────────────────────────────────────────────────

export const runtimes = pgTable(
  "runtimes",
  {
    id: text("id").primaryKey(), // e.g. "electron-win-desktop-01"
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    os: text("os").notNull(), // "win32" | "darwin" | "linux"
    hostname: text("hostname").notNull(),
    isElectron: boolean("is_electron").notNull().default(false),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]), // ['claude-code', 'antigravity-cli']
    status: text("status").notNull().default("offline"), // "online" | "busy" | "offline"
    lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_runtimes_workspace").on(t.workspaceId)]
);

// ─── 3. AI Agent Roster ────────────────────────────────────────────────────────

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    role: text("role").notNull().default(""),
    systemPrompt: text("system_prompt").notNull().default(""),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    cwd: text("cwd"),
    addDirs: jsonb("add_dirs").$type<string[]>().notNull().default([]),
    allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
    disallowedTools: jsonb("disallowed_tools").$type<string[]>().notNull().default([]),
    permissionMode: text("permission_mode").notNull().default("default"),
    mcpServers: jsonb("mcp_servers").$type<Record<string, unknown>>().notNull().default({}),
    maxTurns: integer("max_turns"),
    enabled: boolean("enabled").notNull().default(true),
    signalExtraction: boolean("signal_extraction").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    origin: text("origin").notNull().default("user"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_agents_workspace").on(t.workspaceId, t.slug)]
);

// ─── 4. Projects & Directives ──────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    rootDir: text("root_dir"),
    allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
    disallowedTools: jsonb("disallowed_tools").$type<string[]>().notNull().default([]),
    parentProjectId: text("parent_project_id"),
    isSandbox: boolean("is_sandbox").notNull().default(false),
    gitRemote: text("git_remote"),
    executionProfile: text("execution_profile").notNull().default("factory"),
    stagingBranch: text("staging_branch"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_projects_workspace").on(t.workspaceId)]
);

export const projectDirectives = pgTable(
  "project_directives",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sort: integer("sort").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_project_directives_project").on(t.projectId, t.sort)]
);

// ─── 5. Tasks (Human & Agent Teammate Assignees) ───────────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("backlog"), // "backlog" | "todo" | "in_progress" | "review" | "done"
    assigneeType: text("assignee_type").notNull().default("agent"), // "agent" | "human" | "pair"
    assigneeAgentId: text("assignee_agent_id").references(() => agents.id),
    assigneeUserId: text("assignee_user_id").references(() => users.id),
    targetRuntimeId: text("target_runtime_id").references(() => runtimes.id),
    hitlApproved: boolean("hitl_approved").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_tasks_workspace").on(t.workspaceId, t.status)]
);

// ─── 6. Agent Runs & Execution Transcripts ─────────────────────────────────────

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull().references(() => agents.id),
    projectId: text("project_id").references(() => projects.id),
    taskId: text("task_id").references(() => tasks.id),
    targetRuntimeId: text("target_runtime_id").references(() => runtimes.id),
    trigger: text("trigger").notNull(),
    mode: text("mode").notNull(),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("running"), // "running" | "completed" | "failed" | "paused_hitl"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_runs_workspace").on(t.workspaceId, t.status)]
);

// ─── 7. Obsidian-Compatible Memory Vault & pgvector ───────────────────────────

export const memoryNotes = pgTable(
  "memory_notes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id),
    title: text("title").notNull(),
    path: text("path").notNull(),
    type: text("type").notNull().default("lesson"), // "decision" | "architecture" | "pitfall" | "lesson"
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }), // OpenAI / FastEmbed vector embedding
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_memory_workspace").on(t.workspaceId, t.type)]
);
