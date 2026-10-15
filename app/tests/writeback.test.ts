import { describe, it, expect } from "vitest";
import {
  validateWritebackBatch,
  buildPreview,
  type WritebackItem,
} from "../src/lib/writeback";

const items: WritebackItem[] = [
  { approvalId: 1, tab: "CreateItem", keyRow: "I0027016Error", sheetRange: "CreateItem!G5", field: "Item_status", oldValue: "Error", newValue: "Done" },
  { approvalId: 2, tab: "CreateItem", keyRow: "I0027017Error", sheetRange: "CreateItem!G6", field: "Item_status", oldValue: "Error", newValue: "Done" },
];

describe("validateWritebackBatch", () => {
  it("từ chối khi write_mode đang tắt", () => {
    const r = validateWritebackBatch(items, { writeMode: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/chỉ-đọc|tắt/i);
  });
  it("từ chối batch rỗng", () => {
    const r = validateWritebackBatch([], { writeMode: true });
    expect(r.ok).toBe(false);
  });
  it("từ chối khi thiếu xác nhận", () => {
    const r = validateWritebackBatch(items, { writeMode: true, confirmed: false });
    expect(r.ok).toBe(false);
  });
  it("từ chối range không thuộc tab đã khai báo", () => {
    const bad = [{ ...items[0], sheetRange: "SheetLạ!G5" }];
    const r = validateWritebackBatch(bad, { writeMode: true, confirmed: true });
    expect(r.ok).toBe(false);
  });
  it("từ chối field không nằm trong allowlist", () => {
    const bad = [{ ...items[0], field: "RequestName" }];
    const r = validateWritebackBatch(bad, { writeMode: true, confirmed: true });
    expect(r.ok).toBe(false);
  });
  it("chấp nhận placeholder {row} (resolve số dòng thật lúc apply)", () => {
    const ph = [{ ...items[0], sheetRange: "CreateItem!G:{row}" }];
    const r = validateWritebackBatch(ph, { writeMode: true, confirmed: true });
    expect(r.ok).toBe(true);
  });
  it("chấp nhận batch hợp lệ", () => {
    const r = validateWritebackBatch(items, { writeMode: true, confirmed: true });
    expect(r.ok).toBe(true);
  });
});

describe("buildPreview", () => {
  it("tạo preview diff cũ→mới cho từng dòng", () => {
    const p = buildPreview(items);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ keyRow: "I0027016Error", oldValue: "Error", newValue: "Done" });
  });
});
