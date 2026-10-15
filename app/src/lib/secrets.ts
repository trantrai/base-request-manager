// Mã hoá credential nhạy cảm trong SQLite bằng AES-256-GCM.
// Key máy (32 bytes) lưu NGOÀI repo — KHÔNG bao giờ commit:
//   Windows: %APPDATA%\BaseScope\machine.key
//   Linux/macOS: ~/.config/basescope/machine.key
// Biến môi trường BASESCOPE_KEY_FILE cho phép override (dùng trong test).
//
// Định dạng lưu: "enc:v1:<iv hex>:<ciphertext hex>:<authTag hex>".
// Giá trị plaintext cũ (trước round 1) được migrate tự động lúc khởi động.

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { getDb } from "./db";

const ENC_PREFIX = "enc:v1:";

export const SECRET_KEYS = ["sheetsApiKey", "sheetsSaKey", "smtpPass"] as const;

function keyFilePath(): string {
  const override = process.env.BASESCOPE_KEY_FILE;
  if (override) return override;
  if (process.platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(base, "BaseScope", "machine.key");
  }
  return path.join(os.homedir(), ".config", "basescope", "machine.key");
}

let _key: Buffer | null = null;

/** Lấy (hoặc tạo mới) key máy 32 bytes. */
export function getMachineKey(): Buffer {
  if (_key) return _key;
  const fp = keyFilePath();
  if (fs.existsSync(fp)) {
    const raw = fs.readFileSync(fp, "utf8").trim();
    _key = Buffer.from(raw, "hex");
    if (_key.length !== 32) throw new Error("machine.key không hợp lệ (cần 32 bytes hex).");
    return _key;
  }
  _key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  // (review) mode 0600 chỉ có tác dụng trên Unix — Node bỏ qua `mode` trên Windows;
  // trên Windows file kế thừa ACL của %APPDATA% (riêng theo user) nên vẫn chấp nhận được.
  fs.writeFileSync(fp, _key.toString("hex"), { mode: 0o600 });
  return _key;
}

/** Xoá cache key trong memory (dùng trong test / khi đổi key file). */
export function resetKeyCache(): void {
  _key = null;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENC_PREFIX);
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getMachineKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("hex")}:${ct.toString("hex")}:${tag.toString("hex")}`;
}

/** Giải mã; passthrough nếu là plaintext cũ (để migrate dần). */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;
  const parts = stored.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Định dạng secret mã hoá không hợp lệ.");
  const [ivH, ctH, tagH] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getMachineKey(), Buffer.from(ivH, "hex"));
  decipher.setAuthTag(Buffer.from(tagH, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctH, "hex")), decipher.final()]).toString("utf8");
}

function readRaw(key: string): string | undefined {
  const row = getDb().prepare("SELECT value_json FROM settings WHERE key=?").get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return undefined;
  let v: unknown;
  try {
    v = JSON.parse(row.value_json);
  } catch {
    v = row.value_json;
  }
  return typeof v === "string" ? v : undefined;
}

/** Đọc secret đã giải mã. Trả undefined nếu chưa lưu. */
export function getSecret(key: string): string | undefined {
  const raw = readRaw(key);
  if (!raw) return undefined;
  return decryptSecret(raw);
}

/** Lưu secret (mã hoá AES-256-GCM trước khi ghi DB). */
export function saveSecret(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT INTO settings(key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=datetime('now')"
    )
    .run(key, JSON.stringify(encryptSecret(value)));
}

/**
 * Migrate các secret đang lưu plaintext sang mã hoá (idempotent).
 * Đồng thời dọn secret khỏi `__bundle__` cũ nếu có.
 * Trả về số key đã migrate.
 */
export function migratePlaintextSecrets(): number {
  const db = getDb();
  let n = 0;
  for (const k of SECRET_KEYS) {
    const raw = readRaw(k);
    if (raw && !isEncrypted(raw)) {
      saveSecret(k, raw);
      n++;
    }
  }
  // dọn secret khỏi bundle cũ (bundle mới không chứa secret nữa)
  const brow = db.prepare("SELECT value_json FROM settings WHERE key='__bundle__'").get() as
    | { value_json: string }
    | undefined;
  if (brow) {
    try {
      const b = JSON.parse(brow.value_json) as Record<string, unknown>;
      let dirty = false;
      for (const k of SECRET_KEYS) {
        if (k in b) {
          delete b[k];
          dirty = true;
        }
      }
      if (dirty) {
        db.prepare("UPDATE settings SET value_json=?, updated_at=datetime('now') WHERE key='__bundle__'")
          .run(JSON.stringify(b));
        n++;
      }
    } catch {
      /* bundle hỏng thì bỏ qua */
    }
  }
  return n;
}
