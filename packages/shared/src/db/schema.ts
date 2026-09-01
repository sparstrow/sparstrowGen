import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { McpServerConfig } from "../schemas/agent";
import type { AppliedEffect } from "../schemas/goal";
import type { SpecterReport } from "../schemas/specter";

/**
 * Cloud control plane (Postgres/Supabase).
 *
 * The daemon (`@sparstrow/core`) keeps its own SQLite store for execution and the
 * derived memory index; this schema is the shared BOARD — identity, machines,
 * agents, projects, tasks, runs and transcripts — plus the durable hub that syncs
 * memory note content between machines.
 *
 * Three rules this file follows deliberately:
 *
 * 1. **Local vocabulary wins.** Statuses and enums mirror `@sparstrow/shared`'s
 *    zod schemas exactly (taskStatusSchema, runStatusSchema, memoryNoteTypeSchema).
 *    The daemon and 346+ tests are built on those words; cloud is greenfield, so
 *    translating at the sync boundary would be a bug farm for no gain.
 * 2. **`workspaceId` on every table, including child tables.** Denormalized on
 *    purpose: RLS policies stay a flat `workspace_id` check instead of a recursive
 *    join, which is both faster and far harder to get subtly wrong.
 * 3. **Columns mirror the local SQLite schema.** Sync is a field copy, not a
 *    mapping layer. Where cloud adds a column it is additive (workspaceId,
 *    targetRuntimeId) and where it drops one there is a comment saying why.
 *
 * Enums are `text` + comment rather than pg enums — altering a pg enum is a
 * migration hazard and the authority is zod, not the database.
 */

// ─── 1. Identity ───────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  // `name` is `''` until the owner supplies one. Nothing derives it -- not from
  // an email, not from a literal default. See policies/012_no_invented_names.sql.
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  // Background an agent should know about this workspace. Mirrors `description`'s
  // shape (notNull + "" default) rather than being nullable, so "unset" is one
  // value everywhere instead of two.
  context: text("context").notNull().default(""),
  // Nullable, mirroring users.avatar_url. Matching the neighbouring column of the
  // same kind beats being internally consistent with `context`.
  logoUrl: text("logo_url"),
  ownerId: text("owner_id").notNull(),
  allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
  disallowedTools: jsonb("disallowed_tools").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(), // matches Supabase Auth user.id
  email: text("email").notNull().unique(),
  // `''` until the person supplies one, or until an OAuth provider hands us a
  // name they themselves typed. See policies/012_no_invented_names.sql.
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio").notNull().default(""),
  themeSurface: text("theme_surface").notNull().default("paper"),
  themeBrand: text("theme_brand").notNull().default("amber"),
  themeMode: text("theme_mode").notNull().default("system"),
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
    role: text("role").notNull().default("member"), // owner | admin | member
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_workspace_members_user").on(t.userId, t.workspaceId),
    uniqueIndex("uq_workspace_members").on(t.workspaceId, t.userId),
  ],
);

// ─── 2. Machine registry ───────────────────────────────────────────────────────

/**
 * One row per paired machine. `capabilities` is probed at registration from
 * core's provider registry (`listProviders()`), so the board knows which boxes
 * can serve which providers — e.g. ['claude-code', 'antigravity', 'ollama'].
 *
 * `status` is driven by the daemon's outbound WebSocket: connected = online, and
 * a missed heartbeat window flips it offline. Polling mode falls back to
 * `lastHeartbeat` alone.
 */
export const runtimes = pgTable(
  "runtimes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    os: text("os").notNull(), // win32 | darwin | linux
    hostname: text("hostname").notNull(),
    isElectron: boolean("is_electron").notNull().default(false),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("offline"), // online | busy | offline
    coreVersion: text("core_version"),
    /**
     * What this machine last REPORTED about its own allowlisted settings — the
     * per-runtime WIP snapshot toggle and its retention count (M4, closing G-6).
     *
     * The machine is the source of truth: the switch is a row in its SQLite and
     * the snapshot happens on its disk. This column is a cache of what it
     * confirmed, written at registration and again after it applies a
     * `settings.set` command, so the Machines card can render the acked value
     * rather than an optimistic one. A switch that flips and silently changes
     * nothing is the exact failure G-6 was opened about, and showing a value
     * nobody acked is how you build one.
     */
    reportedSettings: jsonb("reported_settings")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /**
     * Optional soft monthly spend ceiling for runs targeting this machine,
     * set by a workspace member — never derived, never enforced server-side.
     * `null` means no budget is set. Compared client-side in the Machines
     * profile's Activity tab against `SUM(runs.cost_usd)` for the current
     * calendar month; going over it changes a badge's colour, nothing more.
     * No alerting, no run-blocking — that would be a different, larger
     * decision this column does not make on its own.
     */
    monthlyCostBudgetUsd: doublePrecision("monthly_cost_budget_usd"),
    lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_runtimes_workspace").on(t.workspaceId, t.status)],
);

/**
 * Per-machine project binding — replaces the old global `projects.rootDir`.
 *
 * A project's identity is workspace-wide but its bytes are machine-local: the
 * same project is `D:\code\app` on Windows and `/Users/x/code/app` on a Mac, so a
 * single global path column cannot be correct. Work targeted at a runtime that
 * has no binding lands in `task.status = 'project_not_available'` rather than
 * failing, and the UI offers relink / clone / unbind / reassign.
 */
export const runtimeProjects = pgTable(
  "runtime_projects",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runtimeId: text("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    localPath: text("local_path"),
    state: text("state").notNull().default("bound"), // bound | missing | cloning | error
    detail: text("detail"),
    lastSeen: timestamp("last_seen", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.runtimeId, t.projectId] }),
    index("idx_runtime_projects_project").on(t.projectId, t.state),
    index("idx_runtime_projects_workspace").on(t.workspaceId),
  ],
);

/**
 * Plan DD-4: nominated locations grant reading only. There is no `can_write` column,
 * because adding one would invite someone to set it. If a write grant is ever
 * wanted it is a new decision with a new column, deliberately.
 *
 * NOTE: this is cloud state that a machine enforces. The daemon fetches the list
 * and refuses paths outside it. Nothing in this table enforces anything — a reader
 * who thinks the table is the boundary has misread it.
 */
export const machineSharedLocations = pgTable(
  "machine_shared_locations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runtimeId: text("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("uq_machine_shared_locations").on(t.runtimeId, t.path),
    index("idx_machine_shared_locations_workspace").on(t.workspaceId),
    index("idx_machine_shared_locations_runtime").on(t.runtimeId),
    index("idx_machine_shared_locations_added_by").on(t.addedBy),
  ],
);

/**
 * Agent-machine restrictions. Which agents may run on which machine.
 *
 * FR-009: No rows for an agent ⇒ that agent may run anywhere.
 * Matches `tool-policy.ts` locked semantics: an empty allow-list at a level
 * does NOT mean deny all.
 */
export const agentMachineRestrictions = pgTable(
  "agent_machine_restrictions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    runtimeId: text("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("idx_agent_machine_restrictions_workspace").on(t.workspaceId),
    index("idx_agent_machine_restrictions_agent").on(t.agentId),
    index("idx_agent_machine_restrictions_runtime").on(t.runtimeId),
  ],
);

// ─── 3. Daemon auth & dispatch ─────────────────────────────────────────────────

/**
 * Browser-loopback pairing attempts — replaces the old `pairing_codes`.
 *
 * `id` is a machine-generated bearer token (32 bytes, CSPRNG), never a code a
 * person reads or types: the daemon creates the row itself (`status:
 * 'pending'`) before opening the owner's browser to `/pair?attempt=<id>`, so
 * only the daemon process and whoever opens that exact URL ever see it.
 *
 * Lifecycle: `pending` (daemon registered it, machine identity stored, no
 * workspace yet) -> `approved` (an authenticated member picked a workspace
 * and confirmed) -> `consumed` (the daemon exchanged it for a real daemon
 * token, exactly once). The daemon's own local HTTP listener is what makes
 * "approved" ever reach "consumed" — see `exchange_pairing_attempt`
 * (`policies/031_pairing_attempts.sql`) for why the real token is minted
 * there and not at approval time.
 */
export const pairingAttempts = pgTable(
  "pairing_attempts",
  {
    id: text("id").primaryKey(),
    runtimeId: text("runtime_id").notNull(),
    name: text("name").notNull(),
    os: text("os").notNull(),
    hostname: text("hostname").notNull(),
    isElectron: boolean("is_electron").notNull().default(false),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    coreVersion: text("core_version"),
    /** Loopback URL the daemon's local listener is waiting on. Validated
     *  host-is-loopback at insert time; never a public address. */
    callback: text("callback").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | consumed
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    approvedByUserId: text("approved_by_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_pairing_attempts_status_expires").on(t.status, t.expiresAt),
    index("idx_pairing_attempts_workspace").on(t.workspaceId),
  ],
);

/**
 * Daemon credentials. Scoped to ONE workspace and ONE runtime — a
 * workspace-wide token would mean a single compromised laptop exposes every
 * machine. Only the hash is stored; the raw token is shown once at pairing and
 * then lives encrypted in the daemon's `secretsDir` (`~/.sparstrow`), outside
 * `dataDir` where Bash/Read-capable agents could reach it.
 */
export const daemonTokens = pgTable(
  "daemon_tokens",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runtimeId: text("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull().default(""),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_daemon_tokens_runtime").on(t.runtimeId, t.revokedAt),
    index("idx_daemon_tokens_workspace").on(t.workspaceId),
  ],
);

/**
 * The dispatch queue. Commands are ROWS, never messages: the per-runtime
 * Realtime channel is only a doorbell for sub-second pickup, and Realtime is
 * at-most-once — trusting it for delivery would silently lose work. The daemon
 * claims a row with a lease, acks on completion, and polls (~3s) whenever the
 * socket is down.
 *
 * `idempotencyKey` makes a redelivered wake safe: claiming is a conditional
 * update, and a duplicate command collapses onto the same row.
 */
export const runtimeCommands = pgTable(
  "runtime_commands",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runtimeId: text("runtime_id")
      .notNull()
      .references(() => runtimes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // run.start | run.cancel | chat.turn | project.clone | memory.sync | settings.set | providers.discover_models
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"), // pending | claimed | done | failed | expired
    idempotencyKey: text("idempotency_key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_runtime_commands_idem").on(t.idempotencyKey),
    index("idx_runtime_commands_claim").on(t.runtimeId, t.status, t.createdAt),
    index("idx_runtime_commands_workspace").on(t.workspaceId),
    // A fourth index, `idx_runtime_commands_open`, is created by
    // drizzle/policies/009_command_spine.sql. It is partial — `where status in
    // ('pending','claimed')` — so it stays proportional to the work in flight
    // rather than to every command ever dispatched, which is what the claim
    // query actually needs. It lives there rather than here because the M1
    // index above still exists and retiring it is a deliberate drizzle
    // migration, not a side effect of adding the better one.
  ],
);

// ─── 4. Agents & skills ────────────────────────────────────────────────────────

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
    mcpServers: jsonb("mcp_servers").$type<Record<string, McpServerConfig>>().notNull().default({}),
    maxTurns: integer("max_turns"),
    memoryReadScopes: jsonb("memory_read_scopes").$type<string[]>().notNull().default([]),
    memoryWriteScopes: jsonb("memory_write_scopes").$type<string[]>().notNull().default([]),
    extraArgs: jsonb("extra_args").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    signalExtraction: boolean("signal_extraction").notNull().default(true),
    isSystem: boolean("is_system").notNull().default(false),
    // P9 provenance + quarantine lifecycle: user | import, active | quarantined | discarded.
    origin: text("origin").notNull().default("user"),
    status: text("status").notNull().default("active"),
    specterReport: jsonb("specter_report").$type<SpecterReport | null>(),
    importId: text("import_id"),
    sandboxProjectId: text("sandbox_project_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_agents_workspace_slug").on(t.workspaceId, t.slug),
    index("idx_agents_workspace_status").on(t.workspaceId, t.status),
  ],
);

/** P3: (template, project) deployment. `agent:self` memory resolves to the instance. */
export const agentInstances = pgTable(
  "agent_instances",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_agent_instances_agent_project").on(t.agentId, t.projectId),
    index("idx_agent_instances_workspace").on(t.workspaceId),
    index("idx_agent_instances_project").on(t.projectId),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    content: text("content").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    sourceType: text("source_type").notNull().default("manual"), // manual | url | runtime
    sourceRef: text("source_ref"),
    sourceProvider: text("source_provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_skills_workspace_name").on(t.workspaceId, t.name)],
);

export const skillFiles = pgTable(
  "skill_files",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.path] }),
    index("idx_skill_files_workspace").on(t.workspaceId),
  ],
);

export const agentSkills = pgTable(
  "agent_skills",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.agentId, t.skillId] }),
    index("idx_agent_skills_workspace").on(t.workspaceId),
    index("idx_agent_skills_skill").on(t.skillId),
  ],
);

/** P9 skill ingestion: one row per external-repo import. Links are code-enforced. */
export const skillImports = pgTable(
  "skill_imports",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url").notNull(),
    sandboxProjectId: text("sandbox_project_id"),
    status: text("status").notNull().default("cloning"),
    extractorRunId: text("extractor_run_id"),
    error: text("error"),
    foundSkillCount: integer("found_skill_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_skill_imports_workspace").on(t.workspaceId, t.status)],
);

// ─── 5. Projects ───────────────────────────────────────────────────────────────

/**
 * Project IDENTITY only. The working tree lives wherever the developer wants —
 * local disk, GitHub, or both — and the per-machine path is in `runtimeProjects`.
 * There is deliberately no `rootDir` column here.
 */
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
    allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
    disallowedTools: jsonb("disallowed_tools").$type<string[]>().notNull().default([]),
    parentProjectId: text("parent_project_id"),
    isSandbox: boolean("is_sandbox").notNull().default(false),
    gitRemote: text("git_remote"),
    executionProfile: text("execution_profile").notNull().default("factory"), // factory | production_app
    stagingBranch: text("staging_branch"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_projects_workspace_slug").on(t.workspaceId, t.slug),
    index("idx_projects_parent").on(t.parentProjectId),
  ],
);

export const projectDirectives = pgTable(
  "project_directives",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sort: integer("sort").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_project_directives_project").on(t.projectId, t.sort),
    index("idx_project_directives_workspace").on(t.workspaceId),
  ],
);

// ─── 6. Teams ──────────────────────────────────────────────────────────────────

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    // P3 ephemeral teams: soft-archived (never hard-deleted) when the linked task ends.
    isEphemeral: boolean("is_ephemeral").notNull().default(false),
    linkedTaskId: text("linked_task_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_teams_workspace_slug").on(t.workspaceId, t.slug)],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    teamRole: text("team_role"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [
    index("idx_team_members_team").on(t.teamId, t.sort),
    index("idx_team_members_agent").on(t.agentId),
    index("idx_team_members_workspace").on(t.workspaceId),
  ],
);

export const teamProjects = pgTable(
  "team_projects",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.projectId] }),
    index("idx_team_projects_project").on(t.projectId),
    index("idx_team_projects_workspace").on(t.workspaceId),
  ],
);

// ─── 7. Tasks ──────────────────────────────────────────────────────────────────

/**
 * `status` mirrors `taskStatusSchema` exactly — inbox | todo | in_progress |
 * review | done | failed | blocked | blocked_answered | pending_approval |
 * waiting_children — plus one cloud-only addition:
 *
 *   project_not_available — the claiming runtime has no `runtimeProjects` binding
 *   for this task's project. NOT a failure: the UI offers relink, clone from
 *   `gitRemote`, unbind/delete, or reassign to a runtime that has it.
 *
 * The naive backlog/todo/review vocabulary the first draft of this schema used
 * was dropped: it silently lost `blocked` and `waiting_children`, which the P3
 * delegation state machine depends on.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: text("status").notNull().default("inbox"),
    createdByType: text("created_by_type").notNull().default("user"), // user | agent
    createdByAgentId: text("created_by_agent_id"),
    assignedAgentId: text("assigned_agent_id"),
    assigneeUserId: text("assignee_user_id").references(() => users.id),
    /** Which machine should execute this. Null = any capable online runtime. */
    targetRuntimeId: text("target_runtime_id").references(() => runtimes.id, {
      onDelete: "set null",
    }),
    priority: integer("priority").notNull().default(1),
    runId: text("run_id"),
    result: text("result"),
    wakePayload: text("wake_payload"),
    allowedTools: jsonb("allowed_tools").$type<string[]>().notNull().default([]),
    disallowedTools: jsonb("disallowed_tools").$type<string[]>().notNull().default([]),
    /** P3 delegation tree. Code-enforced self-reference, mirroring local. */
    parentTaskId: text("parent_task_id"),
    /** P3 S1-a: delegating parent run's effective toolset, snapshotted at spawn. */
    parentEffectiveTools: jsonb("parent_effective_tools").$type<{
      allowed: string[];
      disallowed: string[];
    } | null>(),
    /** HITL gate. Redesign pending — the column exists so the spine keeps it available. */
    hitlApproved: boolean("hitl_approved").notNull().default(true),
    userId: text("user_id"),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_tasks_workspace_status").on(t.workspaceId, t.status),
    index("idx_tasks_assigned").on(t.assignedAgentId),
    index("idx_tasks_parent").on(t.parentTaskId),
    index("idx_tasks_runtime").on(t.targetRuntimeId, t.status),
    index("idx_tasks_project").on(t.projectId),
    index("idx_tasks_team").on(t.teamId),
    index("idx_tasks_assignee_user").on(t.assigneeUserId),
  ],
);

export const taskQuestions = pgTable(
  "task_questions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    whyBlocked: text("why_blocked").notNull().default(""),
    options: jsonb("options").$type<string[] | null>(),
    recommendation: text("recommendation"),
    defaultIfNoAnswer: text("default_if_no_answer"),
    answer: text("answer"),
    askedByRunId: text("asked_by_run_id"),
    askedAt: timestamp("asked_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    userId: text("user_id"),
  },
  (t) => [
    index("idx_task_questions_queue").on(t.workspaceId, t.answeredAt, t.askedAt),
    index("idx_task_questions_task").on(t.taskId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromType: text("from_type").notNull(), // user | agent | system
    fromAgentId: text("from_agent_id"),
    toAgentId: text("to_agent_id"),
    projectId: text("project_id"),
    taskId: text("task_id"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    status: text("status").notNull().default("unread"),
    spawnedRunId: text("spawned_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_messages_to").on(t.workspaceId, t.toAgentId, t.status)],
);

// ─── 8. Runs & transcripts ─────────────────────────────────────────────────────

/**
 * `status` mirrors `runStatusSchema` — queued | running | succeeded | failed |
 * cancelled | timeout — plus `paused_hitl` for the human gate.
 *
 * `pid` and `exitCode` are deliberately NOT mirrored here: they are meaningless
 * off the machine that owns the process, and they stay in the daemon's SQLite.
 */
export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    agentInstanceId: text("agent_instance_id"),
    projectId: text("project_id"),
    taskId: text("task_id"),
    targetRuntimeId: text("target_runtime_id").references(() => runtimes.id, {
      onDelete: "set null",
    }),
    pipelineRunId: text("pipeline_run_id"),
    pipelineStepId: text("pipeline_step_id"),
    trigger: text("trigger").notNull(),
    triggerRef: text("trigger_ref"),
    mode: text("mode").notNull(),
    prompt: text("prompt").notNull(),
    /** The rendered <memory> block string handed to the model. */
    injectedContext: text("injected_context"),
    /** E1 (P5): structured provenance of what the injector actually injected. */
    injectedMemory: jsonb("injected_memory").$type<{
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
    /** EH6/EH7: run consumed untrusted content; extracted signals are quarantined. */
    untrusted: boolean("untrusted").notNull().default(false),
    status: text("status").notNull().default("queued"),
    sessionId: text("session_id"),
    lane: text("lane").notNull().default("foreground"),
    effectiveTools: jsonb("effective_tools").$type<{
      allowed: string[];
      disallowed: string[];
    } | null>(),
    resultText: text("result_text"),
    costUsd: doublePrecision("cost_usd"),
    numTurns: integer("num_turns"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_runs_workspace_status").on(t.workspaceId, t.status),
    index("idx_runs_agent").on(t.agentId),
    index("idx_runs_created").on(t.workspaceId, t.createdAt),
    index("idx_runs_runtime").on(t.targetRuntimeId),
  ],
);

/**
 * Full transcripts. Measured at ~50 KB per run (27 runs / 613 events / 1.33 MB),
 * heaviest single run 615 KB — so ~10k runs fit the 500 MB free tier and ~167k
 * fit 8 GB Pro. Archiving to object storage is deliberately deferred until real
 * volume justifies it.
 *
 * The unique (run_id, seq) is load-bearing: transcripts are written in batches
 * with retry after network loss, so inserts MUST be idempotent. Without it, a
 * replayed buffer silently duplicates the transcript.
 */
export const runEvents = pgTable(
  "run_events",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    type: text("type").notNull(), // system | assistant | user | status | result | raw
    payload: jsonb("payload").$type<unknown>(),
  },
  // The composite PK already indexes (run_id, seq) — no separate index needed.
  // workspace_id is indexed because every RLS policy filters on it.
  (t) => [
    primaryKey({ columns: [t.runId, t.seq] }),
    index("idx_run_events_workspace").on(t.workspaceId),
  ],
);

// ─── 9. Chat ───────────────────────────────────────────────────────────────────

/**
 * Chat is cloud-canonical with no archiving (revisit against real storage).
 *
 * Turns replay history rather than resuming a provider session id — see
 * `buildTranscriptPrompt` in core's chat service — so a conversation carries no
 * machine-local state and ANY online runtime can continue a `free` or `agent`
 * session. Only `kind: "project"` is machine-affine, because it builds context
 * from a project that must be bound on that runtime.
 */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // free | project | agent | agent-creator
    title: text("title").notNull().default(""),
    projectId: text("project_id"),
    agentId: text("agent_id"),
    provider: text("provider"),
    model: text("model"),
    status: text("status").notNull().default("active"),
    draft: jsonb("draft").$type<Record<string, unknown> | null>(),
    userId: text("user_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_sessions_kind").on(t.workspaceId, t.kind, t.status),
    index("idx_chat_sessions_project").on(t.projectId),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown> | null>(),
    // M12. SET NULL, not CASCADE: message history is the durable record and
    // must outlive an administratively cleaned-up turn row. Every turn owns
    // 0-2 messages via this FK (the user message, eagerly; the assistant
    // message, only on `succeeded`). See doc/tasks/M12/T-M12-01.
    turnId: text("turn_id").references(() => chatTurns.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_messages_session").on(t.sessionId, t.createdAt),
    index("idx_chat_messages_workspace").on(t.workspaceId),
    index("idx_chat_messages_turn").on(t.turnId),
  ],
);

/**
 * CS5 (Band 26) — a file attached to a chat message, stored in the private
 * `chat-attachments` bucket (`025_chat_attachments_storage.sql`), never
 * `public-images` (that bucket's own header forbids it). `storagePath` is
 * the object key, never a public URL — reads go through a short-lived
 * signed URL minted on demand (T-CS5-03), nothing durable is stored here
 * that could resolve to the file without going through RLS first.
 */
export const chatMessageAttachments = pgTable(
  "chat_message_attachments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_message_attachments_message").on(t.messageId),
    index("idx_chat_message_attachments_workspace").on(t.workspaceId),
  ],
);

/**
 * M12 — cloud-only chat-turn dispatch state. No local SQLite mirror: local
 * chat is synchronous and single-machine, with no dispatch state to track.
 *
 * `chat_sessions.kind`/`projectId`/`agentId` are deliberately NOT copied
 * here — the assignment path joins `chat_sessions` by indexed PK at low
 * frequency, and copying risks drift (session's binding changes, turn's
 * copy doesn't) for no measured benefit.
 *
 * `replyText` is ALWAYS the full accumulated reply as of `replySeq`, never a
 * delta — chat has no replayable event trace to reassemble, only a growing
 * block of plain text, which is what makes ingest trivially idempotent under
 * a replayed batch: one seq comparison, no gap handling. See
 * doc/plans/2026-08-23-chat-message-sending.md DD-2.
 *
 * All writes go through SECURITY DEFINER functions
 * (packages/shared/drizzle/policies/014_chat_turn_dispatch.sql) — RLS grants
 * `authenticated` read-only. A member with raw UPDATE could set
 * status='succeeded' and reply_text to anything and it would render as a
 * real assistant reply, the same forgery risk 010_transcript_broadcast.sql
 * calls out for run_events.
 */
export const chatTurns = pgTable(
  "chat_turns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("waiting"), // waiting | in_progress | succeeded | failed
    // Populated only while status = 'waiting'; recomputed by the same
    // assignment pass claim_runtime_commands runs on every poll (no new job).
    waitingReason: text("waiting_reason"), // no_runtime_paired | all_runtimes_offline | project_not_available
    assignedRuntimeId: text("assigned_runtime_id").references(() => runtimes.id, { onDelete: "set null" }),
    commandId: text("command_id").references(() => runtimeCommands.id, { onDelete: "set null" }),
    provider: text("provider"), // null = inherit session/agent default
    model: text("model"),
    attempt: integer("attempt").notNull().default(1),
    // Code-enforced, NOT a DB FK -- mirrors tasks.parentTaskId's existing convention.
    retryOfTurnId: text("retry_of_turn_id"),
    replyText: text("reply_text").notNull().default(""),
    replySeq: integer("reply_seq").notNull().default(0),
    error: text("error"),
    // Set ONCE at creation (`coalesce` in the assignment function), never
    // pushed out by a later recompute.
    waitExpiresAt: timestamp("wait_expires_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_chat_turns_workspace").on(t.workspaceId),
    index("idx_chat_turns_session").on(t.sessionId, t.createdAt),
    index("idx_chat_turns_assigned_runtime").on(t.assignedRuntimeId),
    index("idx_chat_turns_command").on(t.commandId),
    index("idx_chat_turns_retry_of").on(t.retryOfTurnId),
    // FR-004's in-flight guard (at most one non-terminal turn per session) is
    // a partial UNIQUE index, added in 014_chat_turn_dispatch.sql rather than
    // here -- Drizzle's pgTable index builder does not express a `where`
    // predicate on a unique index the way the raw SQL policy file needs to,
    // and enqueue_chat_turn relies on `ON CONFLICT` targeting it by name.
  ],
);

/**
 * T-CS3-02 (Band 26, CS chat session & conversation UX). One row per
 * (workspace, provider) caching the last live model-discovery result, so
 * the chat composer's model picker never blocks on a dispatch round trip.
 * Written only by `public.record_provider_models` (023_provider_model_cache.sql,
 * T-CS3-03) -- a workspace member can SELECT their own workspace's rows but
 * has no direct INSERT/UPDATE grant, so a client can't forge a fake "live"
 * result straight past the function's own validation.
 */
export const providerModelCache = pgTable(
  "provider_model_cache",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    models: jsonb("models").$type<string[]>().notNull().default([]),
    live: boolean("live").notNull().default(false),
    detail: text("detail"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.provider] })],
);

// ─── 10. Pipelines & schedules ─────────────────────────────────────────────────

export const pipelines = pgTable(
  "pipelines",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    projectId: text("project_id"),
    teamId: text("team_id"),
    description: text("description").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_pipelines_workspace").on(t.workspaceId, t.teamId)],
);

export const pipelineSteps = pgTable(
  "pipeline_steps",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    agentId: text("agent_id").notNull(),
    promptTemplate: text("prompt_template").notNull(),
    onFailure: text("on_failure").notNull().default("abort"),
  },
  (t) => [
    index("idx_pipeline_steps_pipeline").on(t.pipelineId, t.position),
    index("idx_pipeline_steps_workspace").on(t.workspaceId),
  ],
);

export const pipelineRuns = pgTable(
  "pipeline_runs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    trigger: text("trigger").notNull(),
    triggerPrompt: text("trigger_prompt"),
    currentStep: integer("current_step").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_pipeline_runs_pipeline").on(t.pipelineId, t.status),
    index("idx_pipeline_runs_workspace").on(t.workspaceId),
  ],
);

export const cronJobs = pgTable(
  "cron_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cronExpr: text("cron_expr").notNull(),
    timezone: text("timezone").notNull().default("system"),
    targetType: text("target_type").notNull(), // agent | pipeline
    targetId: text("target_id").notNull(),
    prompt: text("prompt").notNull(),
    projectId: text("project_id"),
    teamId: text("team_id"),
    /** Which machine the fired run should target. Null = any capable runtime. */
    targetRuntimeId: text("target_runtime_id").references(() => runtimes.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cron_jobs_workspace").on(t.workspaceId, t.enabled, t.nextRunAt),
    index("idx_cron_jobs_runtime").on(t.targetRuntimeId),
  ],
);

// ─── 11. Goals & plans (P6 GOAP) ───────────────────────────────────────────────

export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    teamId: text("team_id"),
    prompt: text("prompt").notNull(),
    status: text("status").notNull().default("planning"),
    planVersion: integer("plan_version").notNull().default(0),
    replanCount: integer("replan_count").notNull().default(0),
    consensus: text("consensus").notNull().default("auto"),
    paused: boolean("paused").notNull().default(false),
    pendingReplanReason: text("pending_replan_reason"),
    blockedReason: text("blocked_reason"),
    planSummary: text("plan_summary"),
    plannerRunId: text("planner_run_id"),
    plannerAttempts: integer("planner_attempts").notNull().default(0),
    consensusRunId: text("consensus_run_id"),
    consensusApprovedVersion: integer("consensus_approved_version"),
    /** Version-stamped applied-effects AUDIT trail — annotation, never control flow. */
    worldState: jsonb("world_state").$type<AppliedEffect[]>().notNull().default([]),
    versionLog: jsonb("version_log")
      .$type<Array<{ planVersion: number; reason: string; at: string; nodeCount: number }>>()
      .notNull()
      .default([]),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_goals_workspace_status").on(t.workspaceId, t.status),
    index("idx_goals_project").on(t.projectId),
  ],
);

/** NO status column (EM4 — node status is DERIVED from its linked task). */
export const planNodes = pgTable(
  "plan_nodes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    goalId: text("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    planVersion: integer("plan_version").notNull(),
    actionId: text("action_id").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull().default(""),
    agentHint: text("agent_hint"),
    agentId: text("agent_id"),
    kind: text("kind").notNull().default("work"),
    pre: jsonb("pre").$type<string[]>().notNull().default([]),
    effects: jsonb("effects").$type<string[]>().notNull().default([]),
    cost: doublePrecision("cost").notNull().default(1),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    position: jsonb("position").$type<{ x: number; y: number } | null>(),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_plan_nodes_goal").on(t.goalId, t.planVersion),
    index("idx_plan_nodes_task").on(t.taskId),
    uniqueIndex("uq_plan_nodes_goal_version_action").on(t.goalId, t.planVersion, t.actionId),
    index("idx_plan_nodes_workspace").on(t.workspaceId),
  ],
);

/**
 * AUTHORITATIVE dependencies (P6-Q0) — recomputed only by plan writes.
 *
 * Keyed on the natural tuple rather than a surrogate id: local SQLite uses an
 * autoincrement integer, which has no stable meaning off that machine, so the
 * sync layer would have to invent one. The edge IS its endpoints.
 */
export const planEdges = pgTable(
  "plan_edges",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
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
    primaryKey({ columns: [t.goalId, t.planVersion, t.fromNodeId, t.toNodeId] }),
    index("idx_plan_edges_goal").on(t.goalId, t.planVersion),
    index("idx_plan_edges_to").on(t.toNodeId),
    index("idx_plan_edges_from").on(t.fromNodeId),
    index("idx_plan_edges_workspace").on(t.workspaceId),
  ],
);

// ─── 12. Memory (sync hub — NOT the search index) ──────────────────────────────

/**
 * Cloud memory is the durable, cross-machine SYNC HUB. It is not where search
 * happens.
 *
 * There is deliberately **no vector column**. Every daemon embeds locally with
 * the same bundled 384-dim FastEmbed model, so embeddings never need to cross the
 * wire — a machine that pulls a foreign note simply re-embeds it into its own
 * `memory_vec`. That keeps retrieval a sub-15ms local read in the hot path of
 * every run, and avoids the failure mode where a slow cloud silently degrades
 * injection to recency fallback with no error surfaced.
 *
 * (The first draft of this schema declared `vector(1536)` — an OpenAI-sized
 * vector that never matched the local 384-dim model. Dropping the column resolves
 * that mismatch by deletion rather than migration.)
 *
 * The markdown file in each machine's vault remains the content source of truth;
 * `content` here is the synced copy. Conflict rule is last-write-wins on
 * `updatedAt` — notes are append-mostly and one-topic-each, so this is adequate.
 */
export const memoryNotes = pgTable(
  "memory_notes",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    scope: text("scope").notNull(), // global | project | agent
    projectSlug: text("project_slug"),
    agentSlug: text("agent_slug"),
    title: text("title").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    source: text("source").notNull().default("user"),
    // note | decision | architecture | pitfall | meeting | lesson
    type: text("type").notNull().default("note"),
    content: text("content").notNull().default(""),
    /** EH6: non-injectable and invisible to agent reads until owner approval. */
    quarantined: boolean("quarantined").notNull().default(false),
    /** P5 dream cycle soft-archive — merged originals are archived, never deleted. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    supersededBy: text("superseded_by"),
    contentHash: text("content_hash").notNull().default(""),
    /** Which machine last wrote this — for sync debugging, not conflict resolution. */
    lastWriterRuntimeId: text("last_writer_runtime_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_memory_notes_workspace_path").on(t.workspaceId, t.path),
    index("idx_memory_notes_scope").on(t.workspaceId, t.scope, t.projectSlug, t.agentSlug),
    index("idx_memory_notes_sync").on(t.workspaceId, t.updatedAt),
  ],
);

/**
 * NOTE: `memory_links` is intentionally absent.
 *
 * P5 wikilinks are hard edges recomputed from the note body on every index
 * (`syncNoteLinks(noteId, body)`), which makes them DERIVED — the same class as
 * `memory_chunks`, `memory_fts` and `memory_vec`. Syncing them would ship state
 * that each machine regenerates for itself the moment it indexes the note.
 */

/** P5 dream cycle contradiction flags — FLAG ONLY, never auto-resolved. */
export const memoryContradictions = pgTable(
  "memory_contradictions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectSlug: text("project_slug"),
    noteA: text("note_a").notNull(),
    noteB: text("note_b").notNull(),
    axis: text("axis").notNull().default(""),
    severity: text("severity").notNull().default("low"),
    confidence: doublePrecision("confidence").notNull().default(0),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
  },
  (t) => [
    index("idx_memory_contradictions_open").on(t.workspaceId, t.resolvedAt),
    // Stored id-ordered so a pair can't be flagged twice.
    uniqueIndex("uq_memory_contradictions_pair").on(t.workspaceId, t.noteA, t.noteB),
  ],
);

// ─── 13. Settings ──────────────────────────────────────────────────────────────

/**
 * Workspace-scoped settings only (e.g. `delegation.maxDepth`,
 * `delegation.crossTeamMessageLimit`). Machine-scoped keys — paths, ports,
 * provider binary locations — stay in the daemon's local `settings` table and
 * are never synced.
 */
export const workspaceSettings = pgTable(
  "workspace_settings",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.key] })],
);
