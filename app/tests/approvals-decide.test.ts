// M3 (snapshotIds) + M4 (decideApproval chỉ cho proposed -> approved/rejected).
import { describe, it, expect } from "vitest";
import {
  snapshotIds, decideApproval,
  ApprovalNotFoundError, ApprovalNotProposedError,
} from "../src/lib/approvals";
import { getDb } from "../src/lib/db";
import { useTempDb, insertLine } from "./helpers";

useTempDb();

function addApproval(state = "proposed"): number {
  const lineId = insertLine({ key_row: `K-${state}` });
  return Number(
    getDb().prepare("INSERT INTO approvals(line_id, proposed_status, state) VALUES (?,'Done',?)")
      .run(lineId, state).lastInsertRowid
  );
}

describe("snapshotIds (M3)", () => {
  it("chốt mảng id, khử trùng, giữ thứ tự", () => {
    expect(snapshotIds(new Set([3, 1, 3, 2]))).toEqual([3, 1, 2]);
    expect(snapshotIds([])).toEqual([]);
  });
});

describe("decideApproval (M4)", () => {
  it("cho duyệt khi còn proposed", () => {
    const id = addApproval("proposed");
    decideApproval(id, "approved", "tester");
    const row = getDb().prepare("SELECT state FROM approvals WHERE id=?").get(id) as { state: string };
    expect(row.state).toBe("approved");
  });
  it("chặn lật approved -> rejected (409)", () => {
    const id = addApproval("approved");
    expect(() => decideApproval(id, "rejected", "tester")).toThrow(ApprovalNotProposedError);
  });
  it("chặn lật applied -> approved (ghi trùng)", () => {
    const id = addApproval("applied");
    expect(() => decideApproval(id, "approved", "tester")).toThrow(ApprovalNotProposedError);
    const row = getDb().prepare("SELECT state FROM approvals WHERE id=?").get(id) as { state: string };
    expect(row.state).toBe("applied");
  });
  it("404 khi id không tồn tại", () => {
    expect(() => decideApproval(999999, "approved", "tester")).toThrow(ApprovalNotFoundError);
  });
});
