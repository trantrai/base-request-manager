// Kết nối SQLite singleton. File DB nằm cạnh app: ./data/basescope.db

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SCHEMA_SQL } from "./schema";
import { STATUS_MAP, STATUS_MAP_VERSION } from "./normalize";
import { migratePlaintextSecrets } from "./secrets";

let _db: Database.Database | null = null;
let _secretsMigrated = false;

export function dbPath(): string {
  // BASESCOPE_DB cho phép override đường dẫn DB (dùng trong test để cô lập).
  const override = process.env.BASESCOPE_DB;
  if (override) return override;
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "basescope.db");
}

export function getDb(dbFile?: string): Database.Database {
  if (_db && !dbFile) return _db;
  const db = new Database(dbFile ?? dbPath());
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  // Seed status_map versioned
  const upsert = db.prepare(
    `INSERT INTO status_map(raw_value, norm_code, label_vi, severity, version)
     VALUES (@raw, @norm, @labelVi, @severity, @version)
     ON CONFLICT(raw_value) DO UPDATE SET
       norm_code=excluded.norm_code, label_vi=excluded.label_vi,
       severity=excluded.severity, version=excluded.version`
  );
  const tx = db.transaction(() => {
    for (const e of STATUS_MAP) upsert.run(e);
  });
  tx();
  if (!_secretsMigrated) {
    // M6: migrate secret plaintext cũ sang AES-256-GCM (idempotent, chạy 1 lần/process).
    // An toàn với circular import db <-> secrets vì cả hai chỉ dùng nhau trong thân hàm.
    _secretsMigrated = true;
    try {
      migratePlaintextSecrets();
    } catch (e) {
      console.error("[secrets] migrate thất bại:", e);
    }
  }
  if (!dbFile) _db = db;
  return db;
}

/** Đóng kết nối singleton (dùng trong test / shutdown). */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

export { STATUS_MAP_VERSION };
