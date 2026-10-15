// Approval Queue + Write-back apply/rollback.

import crypto from "crypto";
import { getDb } from "./db";
import { audit, isWriteMode } from "./queries";
import { validateWritebackBatch, buildPreview, type WritebackItem } from "./writeback";
import type { SheetsClient } from "./sheets";

/** Rule phát hiện ứng viên dọn dẹp: note báo OK nhưng status vẫn lỗi/chờ. */
const CLEANUP_RULES: { code: string; label: string; sql: string }[] = [
  {
    code: "NOTE_OK_STATUS_ERR",
    label: "Note báo đã xong trên SAP/BASE nhưng status còn Lỗi/Chờ xử lý",
    sql: `SELECT id FROM unified_lines
          WHERE status_norm IN ('loi','cho_xu_ly')
            AND (sync_note LIKE '%on SAP and BASE OK%' OR sync_note LIKE '%Update SAP Ok%'
                 OR sync_note LIKE '%Create Item on SAP OK%' OR sync_note LIKE '%Delete Item detail%on SAP OK%')`,
  },
];

export function autoDetect(): { created: number; rules: { code: string; found: number }[] } {
  const db = getDb();
  let created = 0;
  const rules: { code: string; found: number }[] = [];
  const exists = db.prepare("SELECT id FROM approvals WHERE line_id = ? AND state = 'proposed'");
  const ins = db.prepare(
    `INSERT INTO approvals(line_id, proposed_status, proposed_note, reason, rule_code)
     VALUES (?,?,?,?,?)`
  );
  const line = db.prepare("SELECT status_raw, sync_note FROM unified_lines WHERE id = ?");
  for (const r of CLEANUP_RULES) {
    const ids = db.prepare(r.sql).all() as { id: number }[];
    let found = 0;
    const tx = db.transaction(() => {
      for (const { id } of ids) {
        if (exists.get(id)) continue;
        const l = line.get(id) as { status_raw: string; sync_note: string };
        ins.run(id, "Done", "", `${r.label} — note hiện tại: "${l.sync_note.slice(0, 120)}" (status: ${l.status_raw})`, r.code);
        found++;
      }
    });
    tx();
    created += found;
    rules.push({ code: r.code, found });
  }
  audit("system", "auto_detect", { created });
  return { created, rules };
}

export function listApprovals(state?: string) {
  const db = getDb();
  const w = state ? "WHERE a.state = ?" : "";
  const params = state ? [state] : [];
  return db
    .prepare(
      `SELECT a.*, l.tab, l.key_row, l.item_code, l.request_id, l.request_name,
              l.status_raw, l.status_norm, l.sync_note, l.company, l.created_on
       FROM approvals a JOIN unified_lines l ON l.id = a.line_id
       ${w} ORDER BY a.created_at DESC`
    )
    .all(...params);
}

/** Cột status của từng tab trên Sheets (để dựng sheetRange khi apply). */
const STATUS_COL: Record<string, string> = {
  CreateItem: "G", UpdateItem: "H", UpdatePrice: "G", UpdatePriceMua: "G",
  UpdatePriceBan: "G", CreateCom_Bom: "G", ItemCom_Bom_D: "C",
  UpdateStatus: "G", UpdateCOGS: "G", Warehouse: "D", JournalEntry: "D",
  UpdateSAPInvoice: "C", LockOrUnLockSaleStatus: "I",
};

/**
 * Dựng WritebackItem cho các approval đã duyệt.
 * sheetRange cần số dòng thật trên Sheets — lấy từ key_row? Không tin cậy.
 * => Ghi chú: range được xác định bằng cách tìm key_row trên Sheets lúc apply
 * (MATCH), ở đây tạm dùng cột status + key_row để lookup.
 */
export function buildWritebackItems(approvalIds: number[]): WritebackItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.id, l.tab, l.key_row, l.status_raw
       FROM approvals a JOIN unified_lines l ON l.id = a.line_id
       WHERE a.id IN (${approvalIds.map(() => "?").join(",")}) AND a.state = 'approved'`
    )
    .all(...approvalIds) as { id: number; tab: string; key_row: string; status_raw: string }[];
  return rows.map((r) => ({
    approvalId: r.id,
    tab: r.tab,
    keyRow: r.key_row,
    // range thực sẽ resolve lúc apply bằng MATCH key_row; giữ placeholder có cấu trúc
    sheetRange: `${r.tab}!${STATUS_COL[r.tab] ?? "G"}:{row}`,
    field: r.tab === "ItemCom_Bom_D" ? "Status" : "Item_status",
    oldValue: r.status_raw,
    newValue: "Done",
  }));
}

export interface ApplyResult {
  batchId: string;
  applied: number;
  failed: { keyRow: string; error: string }[];
}

/**
 * Áp dụng 1 đợt write-back. Mỗi item: resolve dòng thật trên Sheets bằng
 * MATCH key_row ở cột A, rồi batchUpdate ô status.
 */
export async function applyBatch(
  items: WritebackItem[],
  opts: { confirmed: boolean; appliedBy: string },
  sheets: SheetsClient,
  resolveRow: (tab: string, keyRow: string) => Promise<number | null>,
): Promise<ApplyResult> {
  const db = getDb();
  const v = validateWritebackBatch(items, { writeMode: isWriteMode(), confirmed: opts.confirmed });
  if (!v.ok) throw new Error((v as { error: string }).error);

  const batchId = crypto.randomBytes(8).toString("hex");
  const failed: { keyRow: string; error: string }[] = [];
  let applied = 0;
  const preview = buildPreview(items);
  const ins = db.prepare(
    `INSERT INTO apply_log(batch_id, approval_id, tab, key_row, sheet_range, field,
      old_value, new_value, status, applied_by, error)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  );
  const markApproval = db.prepare("UPDATE approvals SET state='applied', decided_at=datetime('now') WHERE id=?");

  for (const p of preview) {
    try {
      const rowNum = await resolveRow(p.tab, p.keyRow);
      if (!rowNum) throw new Error(`Không tìm thấy key_row trên Sheets (tab ${p.tab})`);
      const col = STATUS_COL[p.tab] ?? "G";
      const range = `${p.tab}!${col}${rowNum}`;
      await sheets.batchUpdate([{ range, value: p.newValue }]);
      ins.run(batchId, p.approvalId, p.tab, p.keyRow, range, p.field, p.oldValue, p.newValue, "applied", opts.appliedBy, "");
      markApproval.run(p.approvalId);
      applied++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ keyRow: p.keyRow, error: msg });
      ins.run(batchId, p.approvalId, p.tab, p.keyRow, p.sheetRange, p.field, p.oldValue, p.newValue, "failed", opts.appliedBy, msg);
    }
  }
  audit(opts.appliedBy, "writeback_apply", { batchId, applied, failed: failed.length });
  return { batchId, applied, failed };
}

/** Rollback 1 đợt: ghi ngược old_value cho các dòng đã applied. */
export async function rollbackBatch(
  batchId: string,
  opts: { appliedBy: string },
  sheets: SheetsClient,
): Promise<{ rolledBack: number; failed: number }> {
  const db = getDb();
  if (!isWriteMode()) throw new Error("Ứng dụng đang ở chế độ chỉ-đọc.");
  const rows = db
    .prepare("SELECT * FROM apply_log WHERE batch_id = ? AND status = 'applied'")
    .all(batchId) as Record<string, unknown>[];
  if (rows.length === 0) throw new Error("Đợt này không có dòng nào ở trạng thái applied.");
  let ok = 0, fail = 0;
  const upd = db.prepare("UPDATE apply_log SET status='rolled_back' WHERE id=?");
  for (const r of rows) {
    try {
      await sheets.batchUpdate([{ range: r["sheet_range"] as string, value: r["old_value"] as string }]);
      upd.run(r["id"]);
      ok++;
    } catch { fail++; }
  }
  audit(opts.appliedBy, "writeback_rollback", { batchId, ok, fail });
  return { rolledBack: ok, failed: fail };
}

export function getApplyLog(batchId?: string) {
  const db = getDb();
  if (batchId) {
    return db.prepare("SELECT * FROM apply_log WHERE batch_id = ? ORDER BY id").all(batchId);
  }
  return db
    .prepare(
      `SELECT batch_id, MIN(applied_at) applied_at, MAX(applied_by) applied_by,
              COUNT(*) total, SUM(status='applied') applied, SUM(status='rolled_back') rolled_back,
              SUM(status='failed') failed
       FROM apply_log GROUP BY batch_id ORDER BY applied_at DESC`
    )
    .all();
}

export { audit };
