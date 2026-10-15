// M5 (TOCTOU: skip khi ô đã bị đổi) + N3 (1 batchUpdate duy nhất cho cả đợt).
import { describe, it, expect, vi } from "vitest";
import { applyBatch } from "../src/lib/approvals";
import type { WritebackItem } from "../src/lib/writeback";
import { saveSetting } from "../src/lib/queries";
import { getDb } from "../src/lib/db";
import { useTempDb, insertLine } from "./helpers";

useTempDb();

const items: WritebackItem[] = [
  { approvalId: 1, tab: "CreateItem", keyRow: "I001", sheetRange: "CreateItem!G:{row}", field: "Item_status", oldValue: "Error", newValue: "Done" },
  { approvalId: 2, tab: "CreateItem", keyRow: "I002", sheetRange: "CreateItem!G:{row}", field: "Item_status", oldValue: "Error", newValue: "Done" },
];

function seedApprovals() {
  const db = getDb();
  insertLine({ key_row: "I001" });
  db.prepare("INSERT INTO approvals(id, line_id, proposed_status, state) VALUES (1,1,'Done','approved')").run();
  db.prepare("INSERT INTO approvals(id, line_id, proposed_status, state) VALUES (2,1,'Done','approved')").run();
}

describe("applyBatch TOCTOU (M5) + batch gộp (N3)", () => {
  it("ghi dòng khớp oldValue, skip dòng đã bị đổi (mismatch)", async () => {
    saveSetting("write_mode", true);
    seedApprovals();
    const batchUpdate = vi.fn().mockResolvedValue(undefined);
    const sheets = { batchUpdate } as never;
    const resolveRow = async (_tab: string, keyRow: string) => (keyRow === "I001" ? 5 : 6);
    // I001 còn "Error" (khớp) — I002 đã bị đổi thành "Done" bởi automation khác
    const readStatus = async (_tab: string, rowNum: number) => (rowNum === 5 ? "Error" : "Done");

    const r = await applyBatch(items, { confirmed: true, appliedBy: "tester" }, sheets, resolveRow, readStatus);

    expect(r.applied).toBe(1);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].keyRow).toBe("I002");
    // N3: chỉ 1 lần batchUpdate cho cả đợt, với đúng dòng đã verify
    expect(batchUpdate).toHaveBeenCalledTimes(1);
    expect(batchUpdate).toHaveBeenCalledWith([{ range: "CreateItem!G5", value: "Done" }]);

    const db = getDb();
    const logs = db.prepare("SELECT key_row, status FROM apply_log ORDER BY id").all() as { key_row: string; status: string }[];
    expect(logs).toEqual([
      { key_row: "I002", status: "mismatch" },
      { key_row: "I001", status: "applied" },
    ]);
    // chỉ approval của dòng đã ghi mới chuyển applied
    const states = db.prepare("SELECT id, state FROM approvals ORDER BY id").all() as { id: number; state: string }[];
    expect(states).toEqual([{ id: 1, state: "applied" }, { id: 2, state: "approved" }]);
  });

  it("(review) không đọc được ô status -> fail-safe: bỏ qua, KHÔNG ghi mù", async () => {
    saveSetting("write_mode", true);
    seedApprovals();
    const batchUpdate = vi.fn().mockResolvedValue(undefined);
    const r = await applyBatch(
      [items[0]], { confirmed: true, appliedBy: "t" },
      { batchUpdate } as never,
      async () => 5,
      async () => null, // cột status ngắn hơn dòng resolve -> không đọc được
    );
    expect(r.applied).toBe(0);
    expect(r.failed).toHaveLength(1);
    expect(batchUpdate).not.toHaveBeenCalled();
    const log = getDb().prepare("SELECT status FROM apply_log").get() as { status: string };
    expect(log.status).toBe("unknown");
    // approval giữ nguyên để retry sau
    const st = getDb().prepare("SELECT state FROM approvals WHERE id=1").get() as { state: string };
    expect(st.state).toBe("approved");
  });

  it("không đọc lại ô khi không truyền readStatus (tương thích cũ)", async () => {
    saveSetting("write_mode", true);
    seedApprovals();
    const batchUpdate = vi.fn().mockResolvedValue(undefined);
    const r = await applyBatch(
      items, { confirmed: true, appliedBy: "t" },
      { batchUpdate } as never,
      async () => 5,
    );
    expect(r.applied).toBe(2);
    expect(batchUpdate).toHaveBeenCalledTimes(1);
  });
});
