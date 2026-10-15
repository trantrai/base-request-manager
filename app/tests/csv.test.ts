import { describe, it, expect } from "vitest";
import { toCsv } from "../src/lib/csv";

describe("toCsv", () => {
  it("xuất UTF-8 BOM để Excel Windows mở đúng tiếng Việt", () => {
    const out = toCsv([{ a: "ĐỀ XUẤT TẠO MÃ HÀNG NỘI BỘ TẾT", b: "I0023613" }]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain("ĐỀ XUẤT TẠO MÃ HÀNG NỘI BỘ TẾT");
  });
  it("escape dấu phẩy, ngoặc kép, xuống dòng theo RFC 4180", () => {
    const out = toCsv([{ a: 'giá "sốc", giảm\nmạnh', b: "x" }]);
    expect(out).toContain('"giá ""sốc"", giảm\nmạnh"');
  });
  it("header lấy từ key của dòng đầu, mảng rỗng -> chuỗi rỗng", () => {
    const out = toCsv([{ a: "1", b: "2" }]);
    expect(out.replace(/^\uFEFF/, "").split("\r\n")[0]).toBe("a,b");
    expect(toCsv([])).toBe("");
  });
});
