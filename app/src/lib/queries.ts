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
  // M8: cột company lẫn nhiều giá trị rác/template ("(trống)", "String",
  // "Chọn Công ty Laria hoặc Reunion", "THE FARMERS"...). Quyết định: dashboard
  // chỉ phân biệt LARIA / REUNION, còn lại gom vào "(khác)" — không xoá dữ liệu gốc.
  const byCompany = db
    .prepare(
      `SELECT CASE WHEN company IN ('LARIA','REUNION') THEN company ELSE '(khác)' END AS company,
        COUNT(*) total,
        SUM(CASE WHEN status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet') THEN 1 ELSE 0 END) pending
       FROM unified_lines GROUP BY 1 ORDER BY pending DESC`
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
  /** M2: cho phép export vượt trần 200 dòng (tối đa 5000) */
  unlimited?: boolean;
}

/** N7: escape ký tự đặc biệt trong LIKE (% _ \) để tìm "%" không match tất cả. */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Chuẩn hoá số nguyên dương — chống NaN từ query string (N6). */
function toPositiveInt(v: unknown, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.floor(n);
}

export function getPending(f: PendingFilter) {
  const db = getDb();
  const page = toPositiveInt(f.page, 1);
  // M2: export được phép tới 5000; UI thường vẫn kẹp 200
  const cap = f.unlimited ? 5000 : 200;
  const pageSize = Math.min(cap, toPositiveInt(f.pageSize, 50));
  const where: string[] = ["status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet')"];
  const params: unknown[] = [];
  if (f.tab) { where.push("tab = ?"); params.push(f.tab); }
  if (f.status) { where.push("status_norm = ?"); params.push(f.status); }
  if (f.company) { where.push("company = ?"); params.push(f.company); }
  if (f.q) {
    where.push("(item_code LIKE ? ESCAPE '\\' OR request_name LIKE ? ESCAPE '\\' OR request_id LIKE ? ESCAPE '\\' OR sync_note LIKE ? ESCAPE '\\')");
    const q = `%${escapeLike(f.q)}%`;
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
  const like = `%${escapeLike(q)}%`;
  return db
    .prepare(
      `SELECT id, tab, key_row, request_id, request_name, status_norm, company, item_code
       FROM unified_lines
       WHERE item_code LIKE ? ESCAPE '\\' OR request_name LIKE ? ESCAPE '\\' OR request_id LIKE ? ESCAPE '\\' OR key_row LIKE ? ESCAPE '\\'
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

export class SyncConflictError extends Error {}

export const SYNC_TIMEOUT_MIN = 30;

/**
 * M7: chặn 2 lần sync chạy chồng nhau (bấm tay + Task Scheduler).
 * - Có run 'running' trong 30 phút gần nhất -> ném SyncConflictError.
 * - Run 'running' quá 30 phút -> coi như kẹt (crash), đánh dấu 'stale' và cho chạy tiếp.
 */
export function checkSyncLock(timeoutMin = SYNC_TIMEOUT_MIN): void {
  const db = getDb();
  const running = db
    .prepare("SELECT id, started_at FROM sync_runs WHERE status='running' ORDER BY id DESC LIMIT 1")
    .get() as { id: number; started_at: string } | undefined;
  if (!running) return;
  const startedMs = Date.parse((running.started_at || "").replace(" ", "T") + "Z");
  const ageMin = (Date.now() - startedMs) / 60000;
  if (ageMin < timeoutMin) {
    throw new SyncConflictError(
      `Đang có một tiến trình đồng bộ chạy (bắt đầu lúc ${running.started_at}). Vui lòng đợi xong rồi thử lại.`
    );
  }
  db.prepare(
    `UPDATE sync_runs SET status='stale', error='Quá ${timeoutMin} phút không xong — coi như kẹt, cho phép chạy lại.' WHERE id=?`
  ).run(running.id);
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
