import { describe, it, expect } from "vitest";
import {
  normalizeStatus,
  extractItemCode,
  isJunkRow,
  STATUS_MAP,
  STATUS_MAP_VERSION,
} from "../src/lib/normalize";

describe("normalizeStatus", () => {
  it("map đúng các biến thể chờ xử lý (kể cả sai chính tả AwaItIng)", () => {
    expect(normalizeStatus("Awaiting").norm).toBe("cho_xu_ly");
    expect(normalizeStatus("AwaItIng").norm).toBe("cho_xu_ly");
    expect(normalizeStatus("awaiting").norm).toBe("cho_xu_ly");
  });
  it("map lỗi / chuyển xử lý / hoàn tất / đã gỡ / đã duyệt", () => {
    expect(normalizeStatus("Error").norm).toBe("loi");
    expect(normalizeStatus("Transfer").norm).toBe("chuyen_xu_ly");
    expect(normalizeStatus("Transfer Mua").norm).toBe("chuyen_xu_ly");
    expect(normalizeStatus("Done").norm).toBe("hoan_tat");
    expect(normalizeStatus("Remove").norm).toBe("da_go");
    expect(normalizeStatus("Removed").norm).toBe("da_go");
    expect(normalizeStatus("Approved").norm).toBe("da_duyet");
  });
  it("trả về khac cho giá trị lạ, label giữ nguyên raw", () => {
    const r = normalizeStatus("XYZ lạ");
    expect(r.norm).toBe("khac");
    expect(r.labelVi).toBe("XYZ lạ");
  });
  it("chuỗi rỗng -> khac", () => {
    expect(normalizeStatus("").norm).toBe("khac");
  });
  it("100% entries trong STATUS_MAP có version hiện tại", () => {
    for (const e of STATUS_MAP) expect(e.version).toBe(STATUS_MAP_VERSION);
  });
  it("label tiếng Việt đúng cho chip UI", () => {
    expect(normalizeStatus("Error").labelVi).toBe("Lỗi");
    expect(normalizeStatus("Awaiting").labelVi).toBe("Chờ xử lý");
    expect(normalizeStatus("Done").labelVi).toBe("Hoàn tất");
  });
});

describe("extractItemCode", () => {
  it("tách suffix trạng thái khỏi key_row (I0023663Approved -> I0023663)", () => {
    expect(extractItemCode("I0023663Approved")).toBe("I0023663");
    expect(extractItemCode("I0023613Done")).toBe("I0023613");
    expect(extractItemCode("I0023702Error")).toBe("I0023702");
    expect(extractItemCode("N0003912AwaItIng")).toBe("N0003912");
    expect(extractItemCode("RI001541Awaiting")).toBe("RI001541");
  });
  it("giữ nguyên khi không có suffix", () => {
    expect(extractItemCode("I0023613")).toBe("I0023613");
    expect(extractItemCode("")).toBe("");
  });
  it("không cắt nhầm mã kết thúc bằng chữ thường hợp lệ", () => {
    // suffix chỉ cắt khi là 1 trong các status token viết hoa/khớp chính xác
    expect(extractItemCode("ABCdone")).toBe("ABCdone");
  });
});

describe("isJunkRow", () => {
  it("dòng template số thứ tự 1..13 là rác", () => {
    for (let i = 1; i <= 13; i++) {
      expect(isJunkRow([String(i), "2", "3", "4"])).toBe(true);
    }
  });
  it("dòng note go-live là rác", () => {
    expect(isJunkRow(["ĐÃ GO-LIVE VỚI UPDATE GIÁ MUA ", "", ""])).toBe(true);
    expect(isJunkRow(["ĐÃ GO-LIVE VỚI UPDATE GIÁ VỐN", "", ""])).toBe(true);
  });
  it("dòng dữ liệu thật không phải rác", () => {
    expect(isJunkRow(["I0023613Done", "2026-10-13", "2980122"])).toBe(false);
    expect(isJunkRow(["RI001541Awaiting", "", ""])).toBe(false);
  });
  it("dòng trống là rác", () => {
    expect(isJunkRow([])).toBe(true);
    expect(isJunkRow(["", "", ""])).toBe(true);
  });
});
