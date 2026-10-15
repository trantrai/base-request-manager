import { ok, err, checkSameOrigin, serverError } from "@/lib/api";
import { SheetsClient } from "@/lib/sheets";
import { getSettings } from "@/lib/queries";
import { getSecret } from "@/lib/secrets";
import { STATUS_COL } from "@/lib/approvals";

export function sheetsClientOrThrow(): SheetsClient {
  const s = getSettings();
  const spreadsheetId = (s["spreadsheetId"] as string) || "";
  if (!spreadsheetId) throw new Error("Chưa cấu hình spreadsheetId trong Cài đặt.");
  if ((s["sheetsAuthType"] as string) !== "service_account") {
    throw new Error("Ghi lên Sheets yêu cầu service account (API key chỉ đọc được).");
  }
  return new SheetsClient(spreadsheetId, {
    type: "service_account",
    saEmail: s["sheetsSaEmail"] as string,
    // M6: private key lưu mã hoá trong DB — giải mã khi dùng
    saPrivateKey: (getSecret("sheetsSaKey") ?? "").replace(/\\n/g, "\n"),
  });
}

/** Resolve số dòng thật trên Sheets bằng cách đọc cột A 1 lần/tab rồi MATCH key_row. */
export async function makeRowResolver(client: SheetsClient) {
  const cache = new Map<string, Map<string, number>>();
  return async (tab: string, keyRow: string): Promise<number | null> => {
    let m = cache.get(tab);
    if (!m) {
      m = new Map();
      const col = await client.getValues(`${tab}!A2:A`);
      col.forEach((r, i) => { if (r[0]) m!.set(r[0].trim(), i + 2); });
      cache.set(tab, m);
    }
    return m.get(keyRow) ?? null;
  };
}

/**
 * M5: đọc cột status của 1 tab 1 lần rồi tra theo số dòng — dùng để kiểm tra
 * TOCTOU (giá trị ô hiện tại có còn giống oldValue lúc preview không).
 */
export function makeStatusReader(client: SheetsClient) {
  const cache = new Map<string, (string | null)[]>();
  return async (tab: string, rowNum: number): Promise<string | null> => {
    let col = cache.get(tab);
    if (!col) {
      const colLetter = STATUS_COL[tab] ?? "G";
      const vals = await client.getValues(`${tab}!${colLetter}2:${colLetter}`);
      col = vals.map((r) => (r[0] ?? "").trim());
      cache.set(tab, col);
    }
    return col[rowNum - 2] ?? null;
  };
}

export { ok, err, checkSameOrigin, serverError };
