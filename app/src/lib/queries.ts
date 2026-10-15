// Tầng truy vấn dùng chung cho API routes và Server Components.

import { getDb } from "./db";

export const PENDING_NORMS = ["cho_xu_ly", "loi", "chuyen_xu_ly", "da_duyet"];

export interface OverviewKpi {
  total: number;
  pending: number;
  byNorm: Record<string, number>;
  byTab: { tab: string; total: number; pending: number }[];
  byCompany: { company: string; total: number; pending: number }[];
}

export function getOverview(): OverviewKpi {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) c FROM unified_lines").get() as { c: number }).c;
  const byNormRows = db
    .prepare("SELECT status_norm n, COUNT(*) c FROM unified_lines GROUP BY n")
    .all() as { n: string; c: number }[];
  const byNorm: Record<string, number> = {};
  let pending = 0;
  for (const r of byNormRows) {
    byNorm[r.n] = r.c;
    if (PENDING_NORMS.includes(r.n)) pending += r.c;
  }
  const byTab = db
    .prepare(
      `SELECT tab, COUNT(*) total,
        SUM(CASE WHEN status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet') THEN 1 ELSE 0 END) pending
       FROM unified_lines GROUP BY tab ORDER BY pending DESC`
    )
    .all() as { tab: string; total: number; pending: number }[];
  const byCompany = db
    .prepare(
      `SELECT COALESCE(NULLIF(company,''),'(trống)') company, COUNT(*) total,
        SUM(CASE WHEN status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet') THEN 1 ELSE 0 END) pending
       FROM unified_lines GROUP BY company ORDER BY pending DESC`
    )
    .all() as { company: string; total: number; pending: number }[];
  return { total, pending, byNorm, byTab, byCompany };
}

export interface PendingFilter {
  tab?: string;
  status?: string;
  company?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export function getPending(f: PendingFilter) {
  const db = getDb();
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, f.pageSize ?? 50));
  const where: string[] = ["status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet')"];
  const params: unknown[] = [];
  if (f.tab) { where.push("tab = ?"); params.push(f.tab); }
  if (f.status) { where.push("status_norm = ?"); params.push(f.status); }
  if (f.company) { where.push("company = ?"); params.push(f.company); }
  if (f.q) {
    where.push("(item_code LIKE ? OR request_name LIKE ? OR request_id LIKE ? OR sync_note LIKE ?)");
    const q = `%${f.q}%`;
    params.push(q, q, q, q);
  }
  const w = where.join(" AND ");
  const total = (db.prepare(`SELECT COUNT(*) c FROM unified_lines WHERE ${w}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(
      `SELECT id, tab, key_row, created_on, request_id, request_name, status_raw, status_norm,
              sync_note, company, item_code, payload_json
       FROM unified_lines WHERE ${w} ORDER BY created_on DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  return { rows, total, page, pageSize };
}

export function getRequestDetail(requestId: string) {
  const db = getDb();
  // match chính xác trước, rồi fallback match theo mã số trong URL base.vn
  let rows = db
    .prepare(
      `SELECT id, tab, key_row, created_on, request_id, request_name, status_raw, status_norm,
              sync_note, company, item_code, payload_json
       FROM unified_lines WHERE request_id = ? ORDER BY tab, created_on`
    )
    .all(requestId);
  if (rows.length === 0) {
    const m = /request=(\d+)/.exec(requestId) ?? /^(\d+)$/.exec(requestId);
    if (m) {
      rows = db
        .prepare(
          `SELECT id, tab, key_row, created_on, request_id, request_name, status_raw, status_norm,
                  sync_note, company, item_code, payload_json
           FROM unified_lines WHERE request_id LIKE ? ORDER BY tab, created_on`
        )
        .all(`%${m[1]}%`);
    }
  }
  const agg = db.prepare("SELECT * FROM requests WHERE request_id = ?").get(requestId) as
    | Record<string, unknown>
    | undefined;
  return { rows, agg };
}

export function searchGlobal(q: string, limit = 30) {
  const db = getDb();
  const like = `%${q}%`;
  return db
    .prepare(
      `SELECT id, tab, key_row, request_id, request_name, status_norm, company, item_code
       FROM unified_lines
       WHERE item_code LIKE ? OR request_name LIKE ? OR request_id LIKE ? OR key_row LIKE ?
       ORDER BY CASE WHEN status_norm IN ('cho_xu_ly','loi') THEN 0 ELSE 1 END, tab
       LIMIT ?`
    )
    .all(like, like, like, like, limit);
}

export function getSyncStatus() {
  const db = getDb();
  const last = db
    .prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  const history = db
    .prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 10")
    .all();
  return { last, history };
}

export function getStatusMap() {
  return getDb().prepare("SELECT * FROM status_map ORDER BY version DESC, raw_value").all();
}

export function getSettings(): Record<string, unknown> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value_json FROM settings").all() as { key: string; value_json: string }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try { out[r.key] = JSON.parse(r.value_json); } catch { out[r.key] = r.value_json; }
  }
  return out;
}

export function saveSetting(key: string, value: unknown) {
  getDb()
    .prepare(
      "INSERT INTO settings(key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=datetime('now')"
    )
    .run(key, JSON.stringify(value));
}

export function isWriteMode(): boolean {
  const s = getSettings();
  return (s["write_mode"] as boolean) === true;
}

export function audit(actor: string, action: string, detail: unknown) {
  getDb()
    .prepare("INSERT INTO audit_log(actor, action, detail_json) VALUES (?,?,?)")
    .run(actor, action, JSON.stringify(detail ?? {}));
}
