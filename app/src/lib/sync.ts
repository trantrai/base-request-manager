// Định nghĩa 13 tab đồng bộ + ánh xạ cột -> UnifiedLine.
// Sync worker đọc header ĐỘNG theo tên cột (không theo index cứng) để chịu được
// việc thêm cột / đổi thứ tự trên Sheets.

import type { TabName } from "./types";

export const TAB_NAMES = [
  "CreateItem", "UpdateItem", "UpdatePrice", "UpdatePriceMua", "UpdatePriceBan",
  "CreateCom_Bom", "ItemCom_Bom_D", "UpdateStatus", "UpdateCOGS", "Warehouse",
  "JournalEntry", "UpdateSAPInvoice", "LockOrUnLockSaleStatus",
] as const satisfies readonly TabName[];

/** Cột chuẩn cần lấy theo tên (không phân biệt hoa thường). */
const WANT = [
  "key_row", "created_on", "requestid", "requestname", "reqtype", "reqgroup",
  "item_status", "status", "action", "sysupdate", "syncnote", "note",
  "company", "message",
] as const;

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[\s_]+/g, "_");

export interface ParsedRow {
  values: Record<string, string>;
  /** Cột mã hàng lấy từ cl_* (tùy tab) */
  itemCode: string;
}

/**
 * Parse 1 dòng sheet thành ParsedRow.
 * - header: dòng tiêu đề (đọc động)
 * - row: mảng giá trị
 * - itemCodeIdx: index cột chứa mã hàng trong vùng cl_* (mặc định tự đoán)
 */
export function parseRow(header: string[], row: string[], itemCodeIdx?: number): ParsedRow {
  const values: Record<string, string> = {};
  const hmap = new Map<string, number>();
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (!hmap.has(n)) hmap.set(n, i);
  });
  for (const w of WANT) {
    const idx = hmap.get(w);
    values[w] = idx !== undefined ? (row[idx] ?? "").trim() : "";
  }
  // mã hàng: ưu tiên cột item_status-family? Không — lấy từ cl_* theo index cấu hình
  let itemCode = "";
  if (itemCodeIdx !== undefined && row[itemCodeIdx]) {
    itemCode = row[itemCodeIdx].trim();
  } else {
    // fallback: tìm cột có tên chứa "itemcode"/"mã" — hiếm khi cần
    const idx = header.findIndex((h) => /item\s*code|mã\s*hàng/i.test(h));
    if (idx >= 0) itemCode = (row[idx] ?? "").trim();
  }
  // ItemCom_Bom_D: mã nằm ngay trong key_row (có suffix trạng thái)
  if (!itemCode && values["key_row"]) itemCode = values["key_row"];
  return { values, itemCode };
}

/** Index cột mã hàng trong vùng dữ liệu cho từng tab (theo phân tích 15/10/2026). */
export const ITEM_CODE_COL: Record<string, number> = {
  CreateItem: 11,      // cl_2
  UpdateItem: 12,      // cl_2 (sau cột Action)
  UpdatePrice: 10,     // cl_1
  UpdatePriceMua: 10,
  UpdatePriceBan: 10,
  CreateCom_Bom: 11,
  ItemCom_Bom_D: 0,    // key_row
  UpdateStatus: 10,
  UpdateCOGS: 10,
  Warehouse: 7,        // WarehouseCode
  JournalEntry: 6,     // Trans. No.
  UpdateSAPInvoice: 5, // TransactionId
  LockOrUnLockSaleStatus: 12,
};
