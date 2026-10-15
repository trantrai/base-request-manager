// Sync engine — logic thuần (không I/O Sheets): biến dòng sheet thô
// thành UnifiedLine đã chuẩn hoá. Phần gọi Sheets API nằm ở API route.

import crypto from "crypto";
import { normalizeStatus, extractItemCode, isJunkRow } from "./normalize";
import { parseRow, ITEM_CODE_COL } from "./sync";
import type { UnifiedLine } from "./types";

/** Tên cột status theo tab (đọc động từ header). */
function statusFieldFor(tab: string): string[] {
  if (tab === "ItemCom_Bom_D") return ["status"];
  if (tab === "Warehouse") return ["syncstatus"];
  if (tab === "JournalEntry") return ["status"];
  if (tab === "UpdateSAPInvoice") return ["status"];
  return ["item_status", "status"];
}

export function transformRows(
  tab: string,
  header: string[],
  rows: string[][],
  startRow = 2,
): { lines: UnifiedLine[]; junk: number } {
  const lines: UnifiedLine[] = [];
  let junk = 0;
  const statusFields = statusFieldFor(tab);
  const codeIdx = ITEM_CODE_COL[tab];
  // tên cột chuẩn đã map vào field riêng — không đưa vào payload
  const stdNames = new Set(["key_row","created_on","requestid","requestname","reqtype","reqgroup",
    "item_status","status","action","sysupdate","syncnote","note","company","message"]);

  rows.forEach((row, i) => {
    if (isJunkRow(row)) {
      junk++;
      return;
    }
    const { values, itemCode: parsedCode } = parseRow(header, row, codeIdx);
    const statusRaw = statusFields.map((f) => values[f] ?? "").find((s) => s !== "") ?? "";
    const { norm } = normalizeStatus(statusRaw);
    const keyRow = values["key_row"] || "";
    const itemCode = extractItemCode(parsedCode || keyRow);

    const payload: Record<string, string> = {};
    header.forEach((h, j) => {
      const name = h.trim();
      if (!name || stdNames.has(name.toLowerCase().replace(/[\s_]+/g, "_"))) return;
      payload[name] = (row[j] ?? "").trim();
    });

    const hash = crypto
      .createHash("md5")
      .update(JSON.stringify([tab, keyRow, statusRaw, values["syncnote"] ?? values["note"] ?? "", itemCode, payload]))
      .digest("hex");

    lines.push({
      tab,
      keyRow,
      sheetRow: startRow + i,
      createdOn: values["created_on"] || "",
      requestId: values["requestid"] || "",
      requestName: values["requestname"] || "",
      reqType: values["reqtype"] || "",
      reqGroup: values["reqgroup"] || "",
      statusRaw,
      statusNorm: norm,
      syncNote: values["syncnote"] || values["note"] || "",
      company: values["company"] || "",
      itemCode,
      payloadJson: JSON.stringify(payload),
      rowHash: hash,
    });
  });
  return { lines, junk };
}
