// M8 (gom company rác), N6 (page/pageSize NaN), N7 (escape LIKE).
import { describe, it, expect } from "vitest";
import { getOverview, getPending, searchGlobal, escapeLike } from "../src/lib/queries";
import { useTempDb, insertLine } from "./helpers";

useTempDb();

describe("escapeLike (N7)", () => {
  it("escape \\ % _", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("a\\b")).toBe("a\\\\b");
    expect(escapeLike("thường")).toBe("thường");
  });
});

describe("getPending (N6)", () => {
  it("page/pageSize NaN -> dùng mặc định, không ném 500", () => {
    insertLine({ status_norm: "loi" });
    const r = getPending({ page: NaN, pageSize: NaN });
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(50);
    expect(r.total).toBe(1);
  });
  it("page âm / 0 -> về 1", () => {
    const r = getPending({ page: -3 });
    expect(r.page).toBe(1);
  });
});

describe("searchGlobal (N7)", () => {
  it('tìm "%" chỉ match dòng chứa % thật, không match tất cả', () => {
    insertLine({ key_row: "K1", item_code: "I1", request_name: "giảm 50% hôm nay" });
    insertLine({ key_row: "K2", item_code: "I2", request_name: "hàng thường" });
    const rows = searchGlobal("%") as { key_row: string }[];
    expect(rows.map((r) => r.key_row)).toEqual(["K1"]);
  });
});

describe("getOverview byCompany (M8)", () => {
  it("chỉ giữ LARIA/REUNION, còn lại gom vào (khác)", () => {
    insertLine({ key_row: "K1", company: "LARIA" });
    insertLine({ key_row: "K2", company: "REUNION" });
    insertLine({ key_row: "K3", company: "" });
    insertLine({ key_row: "K4", company: "String" });
    insertLine({ key_row: "K5", company: "THE FARMERS" });
    insertLine({ key_row: "K6", company: "Chọn Công ty Laria hoặc Reunion" });
    const { byCompany } = getOverview();
    const names = byCompany.map((c) => c.company).sort();
    expect(names).toEqual(["(khác)", "LARIA", "REUNION"]);
    const other = byCompany.find((c) => c.company === "(khác)")!;
    expect(other.total).toBe(4);
  });
});
