// Write-back có kiểm soát: validate batch trước khi ghi lên Sheets.
// Mọi lần ghi phải đi qua: duyệt từng dòng -> preview -> apply (gated) -> apply_log -> rollback.

import { TAB_NAMES } from "./sync";

export interface WritebackItem {
  approvalId: number;
  tab: string;
  keyRow: string;
  /** Range A1 chính xác của ô cần ghi, vd "CreateItem!G123" */
  sheetRange: string;
  /** Chỉ cho phép sửa các field trong allowlist */
  field: string;
  oldValue: string;
  newValue: string;
}

/** Các cột được phép ghi ngược — mặc định chỉ cột trạng thái + ghi chú. */
export const WRITABLE_FIELDS = ["Item_status", "Status", "SyncNote", "Note"] as const;

export interface ValidateOpts {
  writeMode: boolean;
  confirmed?: boolean;
}

export function validateWritebackBatch(
  items: WritebackItem[],
  opts: ValidateOpts,
): { ok: true } | { ok: false; error: string } {
  if (!opts.writeMode) {
    return { ok: false, error: "Ứng dụng đang ở chế độ chỉ-đọc (write_mode tắt). Bật toggle ghi có kiểm soát và xác nhận trước khi áp dụng." };
  }
  if (items.length === 0) return { ok: false, error: "Đợt áp dụng rỗng — hãy chọn ít nhất một dòng đã duyệt." };
  if (!opts.confirmed) return { ok: false, error: "Chưa xác nhận. Hãy xem trước thay đổi và xác nhận trước khi áp dụng." };
  for (const it of items) {
    // chấp nhận placeholder {row} — số dòng thật được resolve bằng MATCH key_row lúc apply
    const m = /^([A-Za-z_]+)![A-Z]+:?(\d+|\{row\})$/.exec(it.sheetRange.trim());
    if (!m || !(TAB_NAMES as readonly string[]).includes(m[1])) {
      return { ok: false, error: `Range không hợp lệ hoặc không thuộc tab đã khai báo: ${it.sheetRange}` };
    }
    if (!(WRITABLE_FIELDS as readonly string[]).includes(it.field)) {
      return { ok: false, error: `Field không nằm trong danh sách cho phép ghi: ${it.field}` };
    }
    if (it.oldValue === it.newValue) {
      return { ok: false, error: `Dòng ${it.keyRow}: giá trị cũ và mới giống nhau, không cần ghi.` };
    }
  }
  return { ok: true };
}

export interface PreviewRow {
  approvalId: number;
  tab: string;
  keyRow: string;
  sheetRange: string;
  field: string;
  oldValue: string;
  newValue: string;
}

/** Dựng preview diff cũ→mới — bước bắt buộc trước khi apply. */
export function buildPreview(items: WritebackItem[]): PreviewRow[] {
  return items.map((it) => ({
    approvalId: it.approvalId,
    tab: it.tab,
    keyRow: it.keyRow,
    sheetRange: it.sheetRange,
    field: it.field,
    oldValue: it.oldValue,
    newValue: it.newValue,
  }));
}
