import { describe, it, expect } from "vitest";
import { transformRows } from "../src/lib/syncEngine";

const HEADER = ["key_row","Created_on","RequestId","RequestName","ReqType","ReqGroup","Item_status","sysupdate","SyncNote","Company","cl_1","cl_2","cl_3"];

describe("transformRows", () => {
  it("biến dòng sheet thành UnifiedLine chuẩn hoá", () => {
    const rows = [
      ["I0023613Done","2026-10-13T11:02:07","2980122","TẾT 2027-ĐIỀU CHỈNH GIÁ","","","Done","","","LARIA","I","I0023613","Set quà"],
      ["RI001541Awaiting","","","","","","AwaItIng","","","LARIA","RI","RI001541","Nấm đông trùng"],
    ];
    const { lines, junk } = transformRows("CreateItem", HEADER, rows);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ tab: "CreateItem", keyRow: "I0023613Done", itemCode: "I0023613", statusRaw: "Done", statusNorm: "hoan_tat", company: "LARIA", requestId: "2980122" });
    expect(lines[1]).toMatchObject({ itemCode: "RI001541", statusNorm: "cho_xu_ly" });
    expect(junk).toBe(0);
    expect(lines[0].rowHash).toMatch(/^[a-f0-9]{32}$/);
  });
  it("loại dòng rác và đếm riêng", () => {
    const rows = [
      ["1","2","3","4","5","6","7","8","9","10","11","12","13"],
      ["ĐÃ GO-LIVE VỚI UPDATE GIÁ MUA ","","","","","","","","","","","","",""],
      ["I0023613Done","2026-10-13","","Test","","","Done","","","LARIA","I","I0023613","x"],
    ];
    const { lines, junk } = transformRows("CreateItem", HEADER, rows);
    expect(lines).toHaveLength(1);
    expect(junk).toBe(2);
  });
  it("payload_json giữ nguyên các cột cl_*", () => {
    const rows = [["I1Done","","","","","","Done","","","","c1","c2","c3"]];
    const { lines } = transformRows("CreateItem", HEADER, rows);
    const p = JSON.parse(lines[0].payloadJson);
    expect(p.cl_1).toBe("c1");
  });
});
