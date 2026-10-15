// Status Normalization Engine — ánh xạ versioned, công khai trên UI.
// Mọi thay đổi mapping phải tăng STATUS_MAP_VERSION và ghi chú lý do.

import type { StatusMapEntry, StatusNorm } from "./types";

export const STATUS_MAP_VERSION = 1;

export const STATUS_MAP: StatusMapEntry[] = [
  { raw: "Awaiting",      norm: "cho_xu_ly",    labelVi: "Chờ xử lý",    severity: "warn",  version: 1 },
  { raw: "AwaItIng",      norm: "cho_xu_ly",    labelVi: "Chờ xử lý",    severity: "warn",  version: 1 },
  { raw: "Error",         norm: "loi",          labelVi: "Lỗi",          severity: "error", version: 1 },
  { raw: "Transfer",      norm: "chuyen_xu_ly", labelVi: "Chuyển xử lý", severity: "warn",  version: 1 },
  { raw: "Transfer Mua",  norm: "chuyen_xu_ly", labelVi: "Chuyển xử lý", severity: "warn",  version: 1 },
  { raw: "Done",          norm: "hoan_tat",     labelVi: "Hoàn tất",     severity: "info",  version: 1 },
  { raw: "Remove",        norm: "da_go",        labelVi: "Đã gỡ",        severity: "muted", version: 1 },
  { raw: "Removed",       norm: "da_go",        labelVi: "Đã gỡ",        severity: "muted", version: 1 },
  { raw: "Approved",      norm: "da_duyet",     labelVi: "Đã duyệt",     severity: "info",  version: 1 },
];

const byRaw = new Map<string, StatusMapEntry>();
for (const e of STATUS_MAP) byRaw.set(e.raw.toLowerCase(), e);

/** Chuẩn hoá 1 giá trị status thô. Không đoán từ note — chỉ map đúng bảng. */
export function normalizeStatus(raw: string): { norm: StatusNorm; labelVi: string; severity: StatusMapEntry["severity"] } {
  const hit = byRaw.get((raw ?? "").trim().toLowerCase());
  if (hit) return { norm: hit.norm, labelVi: hit.labelVi, severity: hit.severity };
  const trimmed = (raw ?? "").trim();
  return { norm: "khac", labelVi: trimmed || "(trống)", severity: "muted" };
}

// Suffix trạng thái thường dính vào key_row, vd "I0023663Approved".
const STATUS_SUFFIXES = ["Awaiting", "AwaItIng", "Approved", "Remove", "Error", "Done"];

/** Tách mã hàng khỏi suffix trạng thái trong key_row. */
export function extractItemCode(keyRow: string): string {
  const k = (keyRow ?? "").trim();
  for (const sfx of STATUS_SUFFIXES) {
    if (k.length > sfx.length && k.endsWith(sfx)) return k.slice(0, -sfx.length);
  }
  return k;
}

// Dòng template "1,2,3,...,13" và các dòng ghi chú lẫn trong vùng dữ liệu.
const JUNK_NOTE_PATTERNS = [/^ĐÃ GO-LIVE/i, /^GHI CHÚ/i, /^NOTE:/i];

/** true nếu dòng là rác (template số thứ tự / dòng note / dòng trống). */
export function isJunkRow(row: string[]): boolean {
  if (!row || row.length === 0) return true;
  const cells = row.map((c) => (c ?? "").trim());
  if (cells.every((c) => c === "")) return true;
  const first = cells[0];
  // Template: key_row là số thứ tự 1..13 và các ô tiếp theo cũng là số tăng dần
  if (/^\d{1,2}$/.test(first)) {
    const n = parseInt(first, 10);
    if (n >= 1 && n <= 13) return true;
  }
  if (JUNK_NOTE_PATTERNS.some((p) => p.test(first))) return true;
  return false;
}
