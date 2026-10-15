// Seed SQLite từ snapshot JSON (scripts/seed-data/*.json) — dữ liệu thật 15/10/2026.
// Chạy: npm run seed   (ghi vào ./data/basescope.db)
// Logic transform mirror src/lib/syncEngine.ts (giữ script độc lập, không cần ts-node).

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(APP_DIR, "scripts", "seed-data");
const DB_FILE = path.join(APP_DIR, "data", "basescope.db");

// ---- normalize (mirror src/lib/normalize.ts) ----
const STATUS_MAP = [
  ["awaiting", "cho_xu_ly"], ["awaiting".replace("a", "A"), "cho_xu_ly"],
  ["error", "loi"], ["transfer", "chuyen_xu_ly"], ["transfer mua", "chuyen_xu_ly"],
  ["done", "hoan_tat"], ["remove", "da_go"], ["removed", "da_go"], ["approved", "da_duyet"],
];
const normLookup = new Map();
for (const [raw, norm] of STATUS_MAP) normLookup.set(raw.toLowerCase(), norm);
normLookup.set("awaiting", "cho_xu_ly"); // AwaItIng lowercase cũng ra awaiting
function normalizeStatus(raw) {
  const hit = normLookup.get((raw ?? "").trim().toLowerCase());
  return hit ?? "khac";
}
const SUFFIXES = ["Awaiting", "AwaItIng", "Approved", "Remove", "Error", "Done"];
function extractItemCode(k) {
  k = (k ?? "").trim();
  for (const s of SUFFIXES) if (k.length > s.length && k.endsWith(s)) return k.slice(0, -s.length);
  return k;
}
function isJunkRow(row) {
  if (!row || row.length === 0) return true;
  const cells = row.map((c) => (c ?? "").trim());
  if (cells.every((c) => c === "")) return true;
  const first = cells[0];
  if (/^\d{1,2}$/.test(first)) { const n = parseInt(first, 10); if (n >= 1 && n <= 13) return true; }
  if (/^(key_row|Date|RequestId|Status|#)$/i.test(first)) return true;
  if (/^ĐÃ GO-LIVE/i.test(first)) return true;
  return false;
}

// ---- schema (mirror src/lib/schema.ts) ----
const SCHEMA = `
CREATE TABLE IF NOT EXISTS unified_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tab TEXT NOT NULL, key_row TEXT NOT NULL,
  sheet_row INTEGER NOT NULL DEFAULT 0,
  created_on TEXT DEFAULT '', request_id TEXT DEFAULT '', request_name TEXT DEFAULT '',
  req_type TEXT DEFAULT '', req_group TEXT DEFAULT '', status_raw TEXT DEFAULT '',
  status_norm TEXT DEFAULT 'khac', sync_note TEXT DEFAULT '', company TEXT DEFAULT '',
  item_code TEXT DEFAULT '', payload_json TEXT DEFAULT '{}', row_hash TEXT DEFAULT '',
  first_seen_at TEXT DEFAULT (datetime('now')), last_seen_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tab, key_row, sheet_row));
CREATE INDEX IF NOT EXISTS idx_lines_tab_status ON unified_lines(tab, status_norm);
CREATE INDEX IF NOT EXISTS idx_lines_company ON unified_lines(company);
CREATE INDEX IF NOT EXISTS idx_lines_item ON unified_lines(item_code);
CREATE INDEX IF NOT EXISTS idx_lines_request ON unified_lines(request_id);
CREATE TABLE IF NOT EXISTS sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT DEFAULT (datetime('now')), finished_at TEXT, duration_ms INTEGER DEFAULT 0,
  tabs_ok INTEGER DEFAULT 0, tabs_fail INTEGER DEFAULT 0, rows_read INTEGER DEFAULT 0,
  rows_upserted INTEGER DEFAULT 0, rows_junk INTEGER DEFAULT 0, status TEXT DEFAULT 'running', error TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS requests (request_id TEXT PRIMARY KEY, tab TEXT DEFAULT '',
  request_name TEXT DEFAULT '', company TEXT DEFAULT '', lines_total INTEGER DEFAULT 0,
  lines_pending INTEGER DEFAULT 0, min_created TEXT DEFAULT '', max_created TEXT DEFAULT '',
  last_seen_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS status_map (raw_value TEXT PRIMARY KEY, norm_code TEXT NOT NULL,
  label_vi TEXT NOT NULL, severity TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL, proposed_status TEXT NOT NULL, proposed_note TEXT DEFAULT '',
  reason TEXT DEFAULT '', rule_code TEXT DEFAULT '', state TEXT DEFAULT 'proposed',
  created_at TEXT DEFAULT (datetime('now')), decided_by TEXT DEFAULT '', decided_at TEXT, note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS apply_log (id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id TEXT NOT NULL,
  approval_id INTEGER, tab TEXT NOT NULL, key_row TEXT NOT NULL, sheet_range TEXT NOT NULL,
  field TEXT NOT NULL, old_value TEXT DEFAULT '', new_value TEXT DEFAULT '',
  status TEXT DEFAULT 'applied', applied_by TEXT DEFAULT '',
  applied_at TEXT DEFAULT (datetime('now')), error TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')), actor TEXT DEFAULT '', action TEXT NOT NULL, detail_json TEXT DEFAULT '{}');
CREATE TABLE IF NOT EXISTS status_changes (id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_id INTEGER NOT NULL, old_raw TEXT DEFAULT '', new_raw TEXT DEFAULT '',
  old_norm TEXT DEFAULT '', new_norm TEXT DEFAULT '', detected_at TEXT DEFAULT (datetime('now')));
`;

const STATUS_LABELS = [
  ["Awaiting", "cho_xu_ly", "Chờ xử lý", "warn"], ["AwaItIng", "cho_xu_ly", "Chờ xử lý", "warn"],
  ["Error", "loi", "Lỗi", "error"], ["Transfer", "chuyen_xu_ly", "Chuyển xử lý", "warn"],
  ["Transfer Mua", "chuyen_xu_ly", "Chuyển xử lý", "warn"], ["Done", "hoan_tat", "Hoàn tất", "info"],
  ["Remove", "da_go", "Đã gỡ", "muted"], ["Removed", "da_go", "Đã gỡ", "muted"],
  ["Approved", "da_duyet", "Đã duyệt", "info"],
];

// cột: [statusIdx, companyIdx, noteIdx, codeIdx, createdIdx, reqIdIdx, reqNameIdx]
const COLS = {
  CreateItem: [6, 9, 8, 11, 1, 2, 3],
  UpdateItem: [7, 10, 9, 12, 1, 2, 3],
  UpdatePrice: [6, 7, 9, 10, 1, 2, 3],
  UpdatePriceMua: [6, 7, 9, 10, 1, 2, 3],
  UpdatePriceBan: [6, 7, 9, 10, 1, 2, 3],
  CreateCom_Bom: [6, 9, 8, 11, 1, 2, 3],
  ItemCom_Bom_D: [2, 3, 5, 0, -1, 1, -1],
  UpdateStatus: [6, 7, 9, 10, 1, 2, 3],
  UpdateCOGS: [6, 7, 9, 10, 1, 2, 3],
  Warehouse: [3, 2, 4, 7, 5, 0, -1],
  JournalEntry: [3, 1, 5, 6, 0, -1, 5],
  UpdateSAPInvoice: [2, -1, 1, 5, 0, -1, 1],
  LockOrUnLockSaleStatus: [8, 11, 10, 12, 1, 2, 3],
};

const g = (r, i) => (i >= 0 && r[i] ? r[i].trim() : "");

function main() {
  fs.mkdirSync(path.join(APP_DIR, "data"), { recursive: true });
  if (fs.existsSync(DB_FILE)) fs.unlinkSync(DB_FILE);
  const db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  const sm = db.prepare("INSERT INTO status_map VALUES (?,?,?,?,?)");
  for (const [raw, norm, label, sev] of STATUS_LABELS) sm.run(raw, norm, label, sev, 1);

  const upsert = db.prepare(`INSERT INTO unified_lines
    (tab, key_row, sheet_row, created_on, request_id, request_name, req_type, req_group,
     status_raw, status_norm, sync_note, company, item_code, payload_json, row_hash, last_seen_at)
    VALUES (@tab,@key_row,@sheet_row,@created_on,@request_id,@request_name,@req_type,@req_group,
     @status_raw,@status_norm,@sync_note,@company,@item_code,@payload_json,@row_hash,datetime('now'))
    ON CONFLICT(tab, key_row, sheet_row) DO UPDATE SET
      created_on=excluded.created_on, request_id=excluded.request_id,
      request_name=excluded.request_name, status_raw=excluded.status_raw,
      status_norm=excluded.status_norm, sync_note=excluded.sync_note,
      company=excluded.company, item_code=excluded.item_code,
      payload_json=excluded.payload_json, row_hash=excluded.row_hash,
      last_seen_at=datetime('now')`);

  const t0 = Date.now();
  let total = 0, junkTotal = 0;
  const runId = db.prepare(
    "INSERT INTO sync_runs(status) VALUES ('running')"
  ).run().lastInsertRowid;

  const tx = db.transaction(() => {
    for (const [tab, col] of Object.entries(COLS)) {
      const f = path.join(DATA_DIR, `${tab}.json`);
      if (!fs.existsSync(f)) { console.log(`  skip ${tab} (không có file)`); continue; }
      const { values } = JSON.parse(fs.readFileSync(f, "utf8"));
      if (!values || values.length < 2) continue;
      const [sI, cI, nI, codeI, crI, rI, rnI] = col;
      const header = values[0];
      const stdIdx = new Set([0, sI, cI, nI, codeI, crI, rI, rnI].filter((i) => i >= 0));
      let n = 0, junk = 0;
      values.slice(1).forEach((row, ri) => {
        const sheetRow = ri + 2;
        if (isJunkRow(row)) { junk++; return; }
        const keyRow = g(row, 0);
        if (!keyRow && tab !== "JournalEntry" && tab !== "UpdateSAPInvoice" && tab !== "Warehouse") { junk++; return; }
        const statusRaw = g(row, sI);
        const company = g(row, cI);
        const note = g(row, nI);
        const codeRaw = codeI === 0 ? keyRow : g(row, codeI);
        const itemCode = extractItemCode(codeRaw || keyRow);
        const created = g(row, crI);
        const reqId = g(row, rI);
        const reqName = rnI >= 0 ? g(row, rnI) : "";
        // payload: giữ mọi cột ngoài các cột chuẩn đã map
        const payload = {};
        header.forEach((h, i) => {
          const name = (h || "").trim();
          if (!name || stdIdx.has(i)) return;
          payload[name] = g(row, i);
        });
        const hash = crypto.createHash("md5").update(JSON.stringify([tab, keyRow, statusRaw, note, itemCode, payload])).digest("hex");
        upsert.run({
          tab, key_row: keyRow || `${tab}#${sheetRow}`, sheet_row: sheetRow,
          created_on: created, request_id: reqId,
          request_name: reqName, req_type: "", req_group: "", status_raw: statusRaw,
          status_norm: normalizeStatus(statusRaw), sync_note: note, company,
          item_code: itemCode, payload_json: JSON.stringify(payload), row_hash: hash,
        });
        n++;
      });
      total += n; junkTotal += junk;
      console.log(`  ${tab}: ${n} dòng (loại ${junk} rác)`);
    }
  });
  tx();

  // aggregate requests (gộp xuyên tab theo request_id)
  db.exec(`INSERT INTO requests(request_id, tab, request_name, company, lines_total, lines_pending, min_created, max_created)
    SELECT request_id, GROUP_CONCAT(DISTINCT tab), MAX(request_name), MAX(company), COUNT(*),
      SUM(CASE WHEN status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet') THEN 1 ELSE 0 END),
      MIN(created_on), MAX(created_on)
    FROM unified_lines WHERE request_id <> '' GROUP BY request_id`);

  db.prepare(`UPDATE sync_runs SET finished_at=datetime('now'), duration_ms=?,
    tabs_ok=?, tabs_fail=0, rows_read=?, rows_upserted=?, rows_junk=?, status='done'
    WHERE id=?`).run(Date.now() - t0, Object.keys(COLS).length, total + junkTotal, total, junkTotal, runId);

  const pend = db.prepare(`SELECT COUNT(*) c FROM unified_lines
    WHERE status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet')`).get().c;
  console.log(`\nSeed xong: ${total} dòng, ${junkTotal} rác, ${pend} dòng cần xử lý → ${DB_FILE}`);
  db.close();
}

main();
