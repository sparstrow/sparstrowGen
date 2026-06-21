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
];
