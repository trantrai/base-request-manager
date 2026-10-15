// Google Sheets API client — chạy trực tiếp từ app (máy Windows),
// KHÔNG dùng hatch_gws_cli. Credential do user cấu hình trong trang Settings.
//
// - Đọc: API key (đủ cho file share "anyone with link") hoặc service account.
// - Ghi (write-back): bắt buộc service account có quyền Editor trên file.

import crypto from "crypto";

export interface SheetsAuth {
  type: "api_key" | "service_account";
  apiKey?: string;
  saEmail?: string;
  saPrivateKey?: string;
}

function b64url(input: Buffer | string): string {
  const b = typeof input === "string" ? Buffer.from(input) : input;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const FETCH_TIMEOUT_MS = 30000;

/** N2: fetch với timeout 30s — tránh sync treo khi mạng đứng (kẹt sync_runs ở 'running'). */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new Error(`Hết thời gian chờ (30s) khi gọi Google API: ${url.split("?")[0]}`);
      // (review) không log query string — với auth api_key, query chứa ?key=<APIKEY>.
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function getServiceAccountToken(saEmail: string, saPrivateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: saEmail,
      sub: saEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const sig = b64url(signer.sign(saPrivateKey));
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(`${unsigned}.${sig}`)}`,
  });
  if (!res.ok) throw new Error(`Lấy access token thất bại: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(`Lấy access token thất bại: ${j.error_description ?? "unknown"}`);
  return j.access_token;
}

export class SheetsClient {
  constructor(
    private spreadsheetId: string,
    private auth: SheetsAuth,
  ) {}

  private async headers(): Promise<Record<string, string>> {
    if (this.auth.type === "api_key") return {};
    const token = await getServiceAccountToken(this.auth.saEmail!, this.auth.saPrivateKey!);
    return { Authorization: `Bearer ${token}` };
  }

  private keyParam(): string {
    return this.auth.type === "api_key" ? `?key=${encodeURIComponent(this.auth.apiKey!)}` : "";
  }

  /** Đọc 1 range, trả về mảng dòng (mỗi dòng là mảng string). */
  async getValues(range: string): Promise<string[][]> {
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(range)}` +
      `${this.keyParam()}${this.auth.type === "api_key" ? "" : ""}`;
    const res = await fetchWithTimeout(url, { headers: await this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sheets values.get thất bại (${range}): HTTP ${res.status} — ${body.slice(0, 200)}`);
    }
    const j = (await res.json()) as { values?: string[][] };
    return j.values ?? [];
  }

  /**
   * Ghi nhiều ô 1 lần (chỉ dùng cho write-back đã duyệt).
   * updates: [{ range: "CreateItem!G123", value: "Done" }]
   */
  async batchUpdate(updates: { range: string; value: string }[]): Promise<void> {
    if (this.auth.type !== "service_account") {
      throw new Error("Ghi lên Sheets yêu cầu service account (API key chỉ đọc được).");
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values:batchUpdate`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { ...(await this.headers()), "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates.map((u) => ({
          range: u.range,
          values: [[u.value]],
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sheets batchUpdate thất bại: HTTP ${res.status} — ${body.slice(0, 300)}`);
    }
  }
}
