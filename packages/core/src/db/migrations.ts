/**
 * Hand-written, ordered SQL migrations applied by the runner in connection.ts.
 * Virtual tables that depend on optional native extensions (vec0) are NOT here —
 * they are feature-detected and created at boot in memory/search-store.ts.
 */
export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  cwd TEXT,
  add_dirs TEXT NOT NULL DEFAULT '[]',
  allowed_tools TEXT NOT NULL DEFAULT '[]',
  disallowed_tools TEXT NOT NULL DEFAULT '[]',
  permission_mode TEXT NOT NULL DEFAULT 'default',
  mcp_servers TEXT NOT NULL DEFAULT '{}',
  max_turns INTEGER,
  memory_read_scopes TEXT NOT NULL DEFAULT '[]',
  memory_write_scopes TEXT NOT NULL DEFAULT '[]',
  extra_args TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  root_dir TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  project_id TEXT,
  pipeline_run_id TEXT,
  pipeline_step_id TEXT,
  trigger TEXT NOT NULL,
  trigger_ref TEXT,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  injected_context TEXT,
  status TEXT NOT NULL,
  session_id TEXT,
  result_text TEXT,
  cost_usd REAL,
  num_turns INTEGER,
  duration_ms INTEGER,
  pid INTEGER,
  exit_code INTEGER,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_runs_agent ON runs(agent_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_created ON runs(created_at);

CREATE TABLE run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT
);
CREATE INDEX idx_run_events_run ON run_events(run_id, seq);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'inbox',
  created_by_type TEXT NOT NULL DEFAULT 'user',
  created_by_agent_id TEXT,
  assigned_agent_id TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  run_id TEXT,
  result TEXT,
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_agent_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  from_type TEXT NOT NULL,
  from_agent_id TEXT,
  to_agent_id TEXT,
  project_id TEXT,
  task_id TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  spawned_run_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_to ON messages(to_agent_id, status);

CREATE TABLE pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pipeline_steps (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  on_failure TEXT NOT NULL DEFAULT 'abort'
);
CREATE INDEX idx_pipeline_steps_pipeline ON pipeline_steps(pipeline_id, position);

CREATE TABLE pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger TEXT NOT NULL,
  trigger_prompt TEXT,
  current_step INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_expr TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'system',
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  project_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE memory_notes (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  project_slug TEXT,
  agent_slug TEXT,
  title TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'user',
  content_hash TEXT NOT NULL DEFAULT '',
  indexed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_memory_notes_scope ON memory_notes(scope, project_slug, agent_slug);

CREATE TABLE memory_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  heading TEXT
);
CREATE INDEX idx_memory_chunks_note ON memory_chunks(note_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE memory_fts USING fts5(
  text, title, tags,
  content='',
  tokenize='porter unicode61'
);
`,
  },
  {
    id: "0002_fts_regular",
    // Contentless FTS5 can't delete rows; switch to a regular FTS5 table whose
    // rowid mirrors memory_chunks.id so reindexing a note can replace its rows.
    sql: `
DROP TABLE IF EXISTS memory_fts;
CREATE VIRTUAL TABLE memory_fts USING fts5(
  text, title, tags,
  tokenize='porter unicode61'
);
`,
  },
  {
    id: "0003_teams",
    sql: `
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE team_projects (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, project_id)
);

CREATE TABLE team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  team_role TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_team_members_team ON team_members(team_id, sort);
`,
  },
  {
    // P1 task lifecycle & escalation. Adds the blocked/wake state-machine columns,
    // the per-question table (EM5), run scheduling lane (EH3), and the tenancy
    // forward-marker user_id (D6-followup — no users table yet; PHASE6-NOTES tracks
    // the eventual real migration). ADD COLUMN-only + one new table, so the
    // in-transaction migration runner is safe (no table rebuild → no need to
    // toggle foreign_keys).
    id: "0004_task_lifecycle",
    sql: `
ALTER TABLE tasks ADD COLUMN wake_payload TEXT;
ALTER TABLE tasks ADD COLUMN user_id TEXT;
ALTER TABLE runs ADD COLUMN lane TEXT NOT NULL DEFAULT 'foreground';
ALTER TABLE runs ADD COLUMN effective_tools TEXT;

CREATE TABLE task_questions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  why_blocked TEXT NOT NULL DEFAULT '',
  options TEXT,
  recommendation TEXT,
  default_if_no_answer TEXT,
  answer TEXT,
  asked_by_run_id TEXT,
  asked_at TEXT NOT NULL,
  answered_at TEXT,
  applied_at TEXT,
  user_id TEXT
);
CREATE INDEX idx_task_questions_queue ON task_questions(answered_at, asked_at);
CREATE INDEX idx_task_questions_task ON task_questions(task_id);
`,
  },
  {
    // P2-lite tool permissions. Project- and task-level allow/disallow lists feed
    // resolveEffectiveTools (Global→Agent→Project→Task); global defaults live in the
    // existing settings table (keys tools.global.allowed / tools.global.disallowed),
    // so no column for them. ADD COLUMN-only — safe under the in-transaction runner.
    // (runs.effective_tools already exists from 0004; P2 only changes its JSON shape
    // from string[] to {allowed,disallowed}, which needs no DDL.)
    id: "0005_tool_permissions",
    sql: `
ALTER TABLE projects ADD COLUMN allowed_tools TEXT NOT NULL DEFAULT '[]';
ALTER TABLE projects ADD COLUMN disallowed_tools TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN allowed_tools TEXT NOT NULL DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN disallowed_tools TEXT NOT NULL DEFAULT '[]';
`,
  },
  {
    // P3 delegation, team-bounded swarms & agent instances.
    // - tasks.parent_task_id: the delegation tree (self-reference; SQLite ADD COLUMN
    //   cannot add an FK — enforced in code, indexed for the completion-watcher's
    //   children queries).
    // - tasks.parent_effective_tools: S1-a LEAST-privilege bound, snapshotted from
    //   the delegating run at spawn_subtask time (separate from the owner-editable
    //   task tool columns so an owner edit can't lift a delegation clamp).
    // - teams ephemeral lifecycle: auto-created around multi-assign tasks,
    //   soft-archived on terminal status (C6/P3-Q3 — hard delete rejected).
    // - agent_instances (locked D5): lazy (template, project) deployments;
    //   runs.agent_instance_id is the EH4 audit seam.
    // ADD COLUMN-only + one new table — safe under the in-transaction runner.
    id: "0006_delegation",
    sql: `
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT;
ALTER TABLE tasks ADD COLUMN parent_effective_tools TEXT;
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);

ALTER TABLE teams ADD COLUMN is_ephemeral INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN linked_task_id TEXT;
ALTER TABLE teams ADD COLUMN archived_at TEXT;

ALTER TABLE runs ADD COLUMN agent_instance_id TEXT;

CREATE TABLE agent_instances (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_agent_instances_agent_project ON agent_instances(agent_id, project_id);
`,
  },
  {
    // P4 projects workspace.
    // - projects.parent_project_id: client-variant fork link (§7, self-ref;
    //   code-enforced FK like tasks.parent_task_id, indexed for the variants tab).
    // - projects.is_sandbox: §6/EH7 — sandboxed runs may only WRITE memory scoped
    //   to this project; its notes are non-global-searchable.
    // - projects.git_remote: the remote this rootDir was cloned/bound from.
    // - agents.is_system: factory-managed system agents (Project Indexer/Reporter),
    //   hidden from the default roster, seeded at boot.
    // - project_directives: ordered, toggleable, always-injected project rules (§2/P4-Q2).
    // ADD COLUMN-only + one new table — safe under the in-transaction runner.
    id: "0007_projects_workspace",
    sql: `
ALTER TABLE projects ADD COLUMN parent_project_id TEXT;
ALTER TABLE projects ADD COLUMN is_sandbox INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN git_remote TEXT;
CREATE INDEX idx_projects_parent ON projects(parent_project_id);

ALTER TABLE agents ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

CREATE TABLE project_directives (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_project_directives_project ON project_directives(project_id, sort);
`,
  },
  {
    // P5 part 2 — smart memory.
    // - memory_notes.type: typed memory (note|decision|architecture|pitfall|
    //   meeting|lesson — enum enforced in zod, not SQL, matching runs.status).
    //   Existing rows migrate to 'note' via the DEFAULT.
    // - memory_notes.quarantined (EH6): signal notes from untrusted-content runs
    //   are non-injectable + invisible to agent reads until owner approval.
    // - memory_notes.archived_at/superseded_by: dream-cycle soft-archive — merged
    //   originals are NEVER hard-deleted; they point at the synthesis note.
    // - memory_links: [[wikilink]] hard edges extracted at index time; to_note_id
    //   is code-managed (nullable, re-resolved as titles appear/vanish), so no FK.
    // - memory_contradictions: dream-cycle flags (P5-Q3 FLAG-ONLY), id-ordered
    //   unique pair so re-detection can't duplicate an open or resolved flag.
    // - runs.untrusted (EH6 + P4-deferred EH7): consumed untrusted/external
    //   content; stamped at finalize.
    // - runs.injected_memory (E1): the injector's structured manifest. NOT named
    //   injected_context — that column already means the rendered block string.
    // - agents.signal_extraction: per-agent toggle for the nightly signal pass.
    // ADD COLUMN-only + two new tables — safe under the in-transaction runner.
    id: "0008_smart_memory",
    sql: `
ALTER TABLE memory_notes ADD COLUMN type TEXT NOT NULL DEFAULT 'note';
ALTER TABLE memory_notes ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_notes ADD COLUMN archived_at TEXT;
ALTER TABLE memory_notes ADD COLUMN superseded_by TEXT;
CREATE INDEX idx_memory_notes_type ON memory_notes(type);

CREATE TABLE memory_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_note_id TEXT NOT NULL REFERENCES memory_notes(id) ON DELETE CASCADE,
  to_note_id TEXT,
  unresolved_title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_memory_links_from ON memory_links(from_note_id);
CREATE INDEX idx_memory_links_to ON memory_links(to_note_id);

CREATE TABLE memory_contradictions (
  id TEXT PRIMARY KEY,
  project_slug TEXT,
  note_a TEXT NOT NULL,
  note_b TEXT NOT NULL,
  axis TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'low',
  confidence REAL NOT NULL DEFAULT 0,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT
);
CREATE INDEX idx_memory_contradictions_open ON memory_contradictions(resolved_at);
CREATE UNIQUE INDEX uq_memory_contradictions_pair ON memory_contradictions(note_a, note_b);

ALTER TABLE runs ADD COLUMN untrusted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runs ADD COLUMN injected_memory TEXT;

ALTER TABLE agents ADD COLUMN signal_extraction INTEGER NOT NULL DEFAULT 1;
`,
  },
  {
    // P6 goal engine — DDL shape decided by the P6-Q0 head-to-head (LLM-planned-
    // DAG won; see fable-handoff/P6-ENGINE-DECISION.md). plan_edges is
    // AUTHORITATIVE (not a render cache): recomputed only by plan writes.
    // FK policy:
    // - goals.project_id/team_id: NO FK, code-enforced (tasks.project_id
    //   precedent) — a goal survives its project/team row.
    // - plan_nodes.goal_id / plan_edges.goal_id + node refs: real FKs, ON DELETE
    //   CASCADE — deleting a goal removes its whole graph (tested).
    // - plan_nodes.task_id: NO FK — tasks are deletable independently; the
    //   executor treats a vanished task as node failure at reconciliation.
    // - plan_nodes.agent_id: NO FK (agents.id references would block agent
    //   deletion mid-goal; resolution re-checks at materialize time).
    // Node STATUS is deliberately absent (EM4): derived from the linked task.
    // Every table carries nullable, indexed user_id (rule 3 forward-marker).
    // New tables only — safe under the in-transaction runner.
    id: "0009_goal_engine",
    sql: `
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  team_id TEXT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  plan_version INTEGER NOT NULL DEFAULT 0,
  replan_count INTEGER NOT NULL DEFAULT 0,
  consensus TEXT NOT NULL DEFAULT 'auto',
  paused INTEGER NOT NULL DEFAULT 0,
  pending_replan_reason TEXT,
  blocked_reason TEXT,
  plan_summary TEXT,
  planner_run_id TEXT,
  planner_attempts INTEGER NOT NULL DEFAULT 0,
  consensus_run_id TEXT,
  consensus_approved_version INTEGER,
  world_state TEXT NOT NULL DEFAULT '[]',
  version_log TEXT NOT NULL DEFAULT '[]',
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_goals_project ON goals(project_id);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_user ON goals(user_id);

CREATE TABLE plan_nodes (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  plan_version INTEGER NOT NULL,
  action_id TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  agent_hint TEXT,
  agent_id TEXT,
  kind TEXT NOT NULL DEFAULT 'work',
  pre TEXT NOT NULL DEFAULT '[]',
  effects TEXT NOT NULL DEFAULT '[]',
  cost REAL NOT NULL DEFAULT 1,
  task_id TEXT,
  position TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_plan_nodes_goal ON plan_nodes(goal_id, plan_version);
CREATE INDEX idx_plan_nodes_task ON plan_nodes(task_id);
CREATE INDEX idx_plan_nodes_user ON plan_nodes(user_id);
CREATE UNIQUE INDEX uq_plan_nodes_goal_version_action ON plan_nodes(goal_id, plan_version, action_id);

CREATE TABLE plan_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  plan_version INTEGER NOT NULL,
  from_node_id TEXT NOT NULL REFERENCES plan_nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES plan_nodes(id) ON DELETE CASCADE,
  user_id TEXT
);
CREATE INDEX idx_plan_edges_goal ON plan_edges(goal_id, plan_version);
CREATE INDEX idx_plan_edges_to ON plan_edges(to_node_id);
CREATE INDEX idx_plan_edges_user ON plan_edges(user_id);
`,
  },
  {
    // P7 git automation & execution profiles.
    // - projects.execution_profile (factory | production_app): the git-ops guard
    //   rails read this to pick the PR target and the set of push-protected refs.
    //   Existing rows default to 'factory' (P7-Q3 — flip client repos manually).
    // - projects.staging_branch: the protected integration branch a production_app
    //   project PRs into (nullable; irrelevant for factory profile).
    // The GitHub PAT is deliberately NOT a column (EC2/P7-Q1) — it lives encrypted
    // outside dataDir in the secret store, never in the agent-readable DB.
    // ADD COLUMN-only — safe under the in-transaction runner.
    id: "0010_git_automation",
    sql: `
ALTER TABLE projects ADD COLUMN execution_profile TEXT NOT NULL DEFAULT 'factory';
ALTER TABLE projects ADD COLUMN staging_branch TEXT;
`,
  },
  {
    // P9 exceptional creation + Skill Specter ingestion.
    // - agents.origin ('user' | 'import') + agents.status
    //   ('active' | 'quarantined' | 'discarded'): imported skills land
    //   quarantined (enabled=false, no grants) until the operator promotes them.
    //   Enums enforced in zod, not SQL (matches runs.status / execution_profile).
    // - agents.specter_report: the Skill Specter security review card (JSON).
    // - agents.import_id / sandbox_project_id: code-enforced links (SQLite ADD
    //   COLUMN can't add FKs) to the import batch + sandbox project of origin.
    // - skill_imports: one row per external-repo ingestion (clone → extract →
    //   review → ready). Links are code-enforced so the audit row survives
    //   sandbox project cleanup.
    // ADD COLUMN- + CREATE TABLE-only — safe under the in-transaction runner.
    id: "0011_skill_ingestion",
    sql: `
ALTER TABLE agents ADD COLUMN origin TEXT NOT NULL DEFAULT 'user';
ALTER TABLE agents ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE agents ADD COLUMN specter_report TEXT;
ALTER TABLE agents ADD COLUMN import_id TEXT;
ALTER TABLE agents ADD COLUMN sandbox_project_id TEXT;
CREATE INDEX idx_agents_status ON agents(status);

CREATE TABLE skill_imports (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  sandbox_project_id TEXT,
  status TEXT NOT NULL DEFAULT 'cloning',
  extractor_run_id TEXT,
  error TEXT,
  found_skill_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_skill_imports_status ON skill_imports(status);
`,
  },
];
