// Schema SQLite cho BaseScope. Chạy idempotent (CREATE TABLE IF NOT EXISTS).

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS unified_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tab TEXT NOT NULL,
  key_row TEXT NOT NULL,
  sheet_row INTEGER NOT NULL DEFAULT 0,
  created_on TEXT DEFAULT '',
  request_id TEXT DEFAULT '',
  request_name TEXT DEFAULT '',
  req_type TEXT DEFAULT '',
  req_group TEXT DEFAULT '',
  status_raw TEXT DEFAULT '',
  status_norm TEXT DEFAULT 'khac',
  sync_note TEXT DEFAULT '',
  company TEXT DEFAULT '',
  item_code TEXT DEFAULT '',
  payload_json TEXT DEFAULT '{}',
  row_hash TEXT DEFAULT '',
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tab, key_row, sheet_row)
);
CREATE INDEX IF NOT EXISTS idx_lines_tab_status ON unified_lines(tab, status_norm);
CREATE INDEX IF NOT EXISTS idx_lines_company ON unified_lines(company);
CREATE INDEX IF NOT EXISTS idx_lines_item ON unified_lines(item_code);
CREATE INDEX IF NOT EXISTS idx_lines_request ON unified_lines(request_id);

CREATE TABLE IF NOT EXISTS status_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL REFERENCES unified_lines(id),
  old_raw TEXT DEFAULT '',
  new_raw TEXT DEFAULT '',
  old_norm TEXT DEFAULT '',
  new_norm TEXT DEFAULT '',
  detected_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_changes_detected ON status_changes(detected_at);

CREATE TABLE IF NOT EXISTS requests (
  request_id TEXT PRIMARY KEY,
  tab TEXT DEFAULT '',
  request_name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  lines_total INTEGER DEFAULT 0,
  lines_pending INTEGER DEFAULT 0,
  min_created TEXT DEFAULT '',
  max_created TEXT DEFAULT '',
  last_seen_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS status_map (
  raw_value TEXT PRIMARY KEY,
  norm_code TEXT NOT NULL,
  label_vi TEXT NOT NULL,
  severity TEXT NOT NULL,
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER DEFAULT 0,
  tabs_ok INTEGER DEFAULT 0,
  tabs_fail INTEGER DEFAULT 0,
  rows_read INTEGER DEFAULT 0,
  rows_upserted INTEGER DEFAULT 0,
  rows_junk INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL REFERENCES unified_lines(id),
  proposed_status TEXT NOT NULL,
  proposed_note TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  rule_code TEXT DEFAULT '',
  state TEXT DEFAULT 'proposed',
  created_at TEXT DEFAULT (datetime('now')),
  decided_by TEXT DEFAULT '',
  decided_at TEXT,
  note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_approvals_state ON approvals(state);

CREATE TABLE IF NOT EXISTS apply_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  approval_id INTEGER REFERENCES approvals(id),
  tab TEXT NOT NULL,
  key_row TEXT NOT NULL,
  sheet_range TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  status TEXT DEFAULT 'applied',
  applied_by TEXT DEFAULT '',
  applied_at TEXT DEFAULT (datetime('now')),
  error TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_apply_batch ON apply_log(batch_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  actor TEXT DEFAULT '',
  action TEXT NOT NULL,
  detail_json TEXT DEFAULT '{}'
);
`;
