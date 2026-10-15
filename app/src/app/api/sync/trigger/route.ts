export const dynamic = "force-dynamic";

// Chạy sync tay: đọc 15 tab từ Sheets API -> transform -> upsert SQLite.
// Yêu cầu đã cấu hình Sheets credential trong Settings.

import { ok, err, checkSameOrigin, serverError } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getSettings, audit, checkSyncLock, SyncConflictError } from "@/lib/queries";
import { getSecret } from "@/lib/secrets";
import { SheetsClient } from "@/lib/sheets";
import { TAB_NAMES } from "@/lib/sync";
import { transformRows } from "@/lib/syncEngine";

export async function POST(req: Request) {
  if (!checkSameOrigin(req)) return err("Yêu cầu không hợp lệ.", 403);
  try {
    return await runSync();
  } catch (e) {
    // N4: không lộ chi tiết nội bộ cho client
    return serverError(e, "Đồng bộ thất bại. Vui lòng thử lại.");
  }
}

async function runSync() {
  const s = getSettings();
  const spreadsheetId = (s["spreadsheetId"] as string) || "1bfSU5RQ2FZccs4rea8WrxKSyW0HsP7ntuOuL67rATw0";
  const authType = (s["sheetsAuthType"] as string) || "";
  if (!authType) {
    return err("Chưa cấu hình kết nối Google Sheets. Vào trang Cài đặt để nhập API key hoặc service account.", 400);
  }
  const client = new SheetsClient(spreadsheetId, authType === "api_key"
    ? { type: "api_key", apiKey: getSecret("sheetsApiKey") }
    : {
        type: "service_account",
        saEmail: s["sheetsSaEmail"] as string,
        saPrivateKey: (getSecret("sheetsSaKey") ?? "")?.replace(/\\n/g, "\n"),
      });

  const db = getDb();

  // M7: chống 2 lần sync chạy chồng nhau — logic chi tiết trong queries.checkSyncLock
  try {
    checkSyncLock();
  } catch (e) {
    if (e instanceof SyncConflictError) return err(e.message, 409);
    throw e;
  }

  const t0 = Date.now();
  const runId = (db.prepare("INSERT INTO sync_runs(status) VALUES ('running')").run().lastInsertRowid as number);
  let tabsOk = 0, tabsFail = 0, rowsRead = 0, rowsUpserted = 0, rowsJunk = 0;

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
  const findLine = db.prepare("SELECT id, status_raw, status_norm, row_hash FROM unified_lines WHERE tab=? AND key_row=? AND sheet_row=?");
  const addChange = db.prepare(
    "INSERT INTO status_changes(line_id, old_raw, new_raw, old_norm, new_norm) VALUES (?,?,?,?,?)");

  for (const tab of TAB_NAMES) {
    try {
      // đọc header trước để transform động
      const head = await client.getValues(`${tab}!A1:Z1`);
      const header = (head[0] ?? []) as string[];
      const values = await client.getValues(`${tab}!A2:Z`);
      rowsRead += values.length;
      const { lines, junk } = transformRows(tab, header, values);
      rowsJunk += junk;
      const tx = db.transaction(() => {
        for (const l of lines) {
          const prev = findLine.get(tab, l.keyRow, l.sheetRow) as
            | { id: number; status_raw: string; status_norm: string; row_hash: string }
            | undefined;
          upsert.run({
            tab: l.tab, key_row: l.keyRow, sheet_row: l.sheetRow,
            created_on: l.createdOn, request_id: l.requestId,
            request_name: l.requestName, req_type: l.reqType, req_group: l.reqGroup,
            status_raw: l.statusRaw, status_norm: l.statusNorm, sync_note: l.syncNote,
            company: l.company, item_code: l.itemCode, payload_json: l.payloadJson, row_hash: l.rowHash,
          });
          if (prev && prev.row_hash !== l.rowHash && prev.status_raw !== l.statusRaw) {
            const idRow = findLine.get(tab, l.keyRow, l.sheetRow) as { id: number };
            addChange.run(idRow.id, prev.status_raw, l.statusRaw, prev.status_norm, l.statusNorm);
          }
          rowsUpserted++;
        }
      });
      tx();
      tabsOk++;
    } catch (e) {
      tabsFail++;
      db.prepare("UPDATE sync_runs SET error=? WHERE id=?")
        .run(`${tab}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500), runId);
    }
  }

  // aggregate lại requests
  db.exec("DELETE FROM requests");
  db.exec(`INSERT INTO requests(request_id, tab, request_name, company, lines_total, lines_pending, min_created, max_created)
    SELECT request_id, GROUP_CONCAT(DISTINCT tab), MAX(request_name), MAX(company), COUNT(*),
      SUM(CASE WHEN status_norm IN ('cho_xu_ly','loi','chuyen_xu_ly','da_duyet') THEN 1 ELSE 0 END),
      MIN(created_on), MAX(created_on)
    FROM unified_lines WHERE request_id <> '' GROUP BY request_id`);

  db.prepare(`UPDATE sync_runs SET finished_at=datetime('now'), duration_ms=?, tabs_ok=?, tabs_fail=?,
    rows_read=?, rows_upserted=?, rows_junk=?, status=? WHERE id=?`)
    .run(Date.now() - t0, tabsOk, tabsFail, rowsRead, rowsUpserted, rowsJunk, tabsFail ? "partial" : "done", runId);
  audit("user", "sync_trigger", { tabsOk, tabsFail, rowsUpserted });
  return ok({ tabsOk, tabsFail, rowsRead, rowsUpserted, rowsJunk });
}
