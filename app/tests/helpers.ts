// Helper dùng chung: cô lập DB + key file cho mỗi test.
import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, afterEach } from "vitest";
import { closeDb, getDb } from "../src/lib/db";
import { resetKeyCache } from "../src/lib/secrets";

export function useTempDb() {
  let dir = "";
  beforeEach(() => {
    closeDb();
    resetKeyCache();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "bs-test-"));
    process.env.BASESCOPE_DB = path.join(dir, "t.db");
    process.env.BASESCOPE_KEY_FILE = path.join(dir, "machine.key");
    getDb(); // khởi tạo schema
  });
  afterEach(() => {
    closeDb();
    resetKeyCache();
    delete process.env.BASESCOPE_DB;
    delete process.env.BASESCOPE_KEY_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

/** Chèn 1 dòng unified_lines tối thiểu cho test. */
export function insertLine(over: Record<string, unknown> = {}) {
  const db = getDb();
  const base: Record<string, unknown> = {
    tab: "CreateItem", key_row: "I0001", sheet_row: 2, created_on: "2026-10-15",
    request_id: "1", request_name: "Test", req_type: "", req_group: "",
    status_raw: "Error", status_norm: "loi", sync_note: "", company: "LARIA",
    item_code: "I0001", payload_json: "{}", row_hash: "h",
    ...over,
  };
  const cols = Object.keys(base).join(",");
  const vals = Object.keys(base).map((k) => base[k]);
  const ph = vals.map(() => "?").join(",");
  return Number(db.prepare(`INSERT INTO unified_lines(${cols}) VALUES (${ph})`).run(...vals).lastInsertRowid);
}
