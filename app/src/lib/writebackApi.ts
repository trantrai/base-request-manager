import { ok, err } from "@/lib/api";
import { SheetsClient } from "@/lib/sheets";
import { getSettings } from "@/lib/queries";

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
    saPrivateKey: ((s["sheetsSaKey"] as string) ?? "").replace(/\\n/g, "\n"),
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

export { ok, err };
