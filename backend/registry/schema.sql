-- Tool Registry Schema
-- SAFETY: No DELETE allowed — all removals are soft-deletes via status='inactive'

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('api', 'cli', 'library', 'service', 'other')),
  description TEXT,
  repo_url TEXT,
  interface_type TEXT,
  interface_details TEXT,
  capabilities TEXT, -- JSON array
  inputs TEXT, -- JSON array
  outputs TEXT, -- JSON array
  metadata TEXT, -- JSON object
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'error')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_request TEXT NOT NULL,
  plan TEXT, -- JSON execution plan
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  result TEXT,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE TABLE IF NOT EXISTS execution_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  step_number INTEGER NOT NULL,
  tool_id INTEGER,
  action TEXT NOT NULL,
  inputs TEXT, -- JSON
  outputs TEXT, -- JSON
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
  error TEXT,
  started_at DATETIME,
  completed_at DATETIME,
  FOREIGN KEY (execution_id) REFERENCES executions(id),
  FOREIGN KEY (tool_id) REFERENCES tools(id)
);

-- Recycle bin: preserves deleted records for restore
CREATE TABLE IF NOT EXISTS recycle_bin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tools_type ON tools(type);
CREATE INDEX IF NOT EXISTS idx_tools_status ON tools(status);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);

CREATE TABLE IF NOT EXISTS repo_cache (
  repo_key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Store: tool folders for declarative scan pipelines
CREATE TABLE IF NOT EXISTS tool_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  scan_type TEXT NOT NULL DEFAULT 'repo' CHECK(scan_type IN ('repo','web')),
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tool_folder_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER NOT NULL,
  tool_id INTEGER NOT NULL,
  order_index INTEGER DEFAULT 0,
  UNIQUE(folder_id, tool_id),
  FOREIGN KEY (folder_id) REFERENCES tool_folders(id),
  FOREIGN KEY (tool_id) REFERENCES tools(id)
);

CREATE INDEX IF NOT EXISTS idx_tool_folders_active ON tool_folders(is_active);
CREATE INDEX IF NOT EXISTS idx_folder_members_folder ON tool_folder_members(folder_id);

-- Audit trail: tamper-evident log of every scan action
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP,
  action TEXT NOT NULL,
  target TEXT,
  scanner TEXT,
  command TEXT,
  user TEXT,
  started_at TEXT,
  ended_at TEXT,
  exit_code INTEGER,
  sandbox TEXT,
  prev_hash TEXT,
  entry_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
