export const dynamic = "force-dynamic";

import { z } from "zod";
import { ok, err, checkSameOrigin } from "@/lib/api";
import { getSettings, saveSetting, audit, isWriteMode } from "@/lib/queries";
import { saveSecret, SECRET_KEYS } from "@/lib/secrets";

const SECRET_PLACEHOLDER = "•••đã lưu•••";

function sanitize(s: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...s };
  for (const k of SECRET_KEYS) if (k in out) out[k] = out[k] ? SECRET_PLACEHOLDER : "";
  return out;
}

export async function GET() {
  return ok({ settings: sanitize(getSettings()), writeMode: isWriteMode() });
}

const SettingsSchema = z.object({
  spreadsheetId: z.string().max(200).optional(),
  sheetsAuthType: z.enum(["api_key", "service_account", ""]).optional(),
  sheetsApiKey: z.string().max(500).optional(),
  sheetsSaEmail: z.string().max(200).optional(),
  sheetsSaKey: z.string().max(10000).optional(),
  smtpHost: z.string().max(200).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpUser: z.string().max(200).optional(),
  smtpPass: z.string().max(500).optional(),
  smtpFrom: z.string().max(200).optional(),
  alertTo: z.string().max(500).optional(),
}).strict();

export async function PUT(req: Request) {
  if (!checkSameOrigin(req)) return err("Yêu cầu không hợp lệ.", 403);
  const body = SettingsSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Dữ liệu cài đặt không hợp lệ.", 400);
  const current = getSettings();
  const merged: Record<string, unknown> = { ...(current as object) };
  for (const [k, v] of Object.entries(body.data)) {
    if (v === undefined) continue;
    // M6: secret nhạy cảm lưu mã hoá AES-256-GCM, không bao giờ plaintext
    if ((SECRET_KEYS as readonly string[]).includes(k)) {
      // giữ secret cũ khi client gửi placeholder/rỗng
      if (v === "" || v === SECRET_PLACEHOLDER) continue;
      saveSecret(k, String(v));
      continue;
    }
    merged[k] = v;
  }
  // bundle gộp CHỈ chứa key không nhạy cảm (secret đã lưu riêng, mã hoá ở trên)
  const bundleSafe: Record<string, unknown> = { ...merged };
  for (const k of SECRET_KEYS) delete bundleSafe[k];
  saveSetting("__bundle__", bundleSafe);
  // đồng thời lưu từng key không nhạy cảm để code đọc được
  for (const [k, v] of Object.entries(merged)) {
    if ((SECRET_KEYS as readonly string[]).includes(k)) continue;
    saveSetting(k, v);
  }
  audit("user", "settings_update", { keys: Object.keys(body.data) });
  return ok({ saved: true });
}

const WriteModeSchema = z.object({
  enable: z.boolean(),
  confirmText: z.string().optional(),
});

/** Bật/tắt write-back. Bật yêu cầu confirmText === "DONG Y". */
export async function POST(req: Request) {
  if (!checkSameOrigin(req)) return err("Yêu cầu không hợp lệ.", 403);
  const body = WriteModeSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Dữ liệu không hợp lệ.", 400);
  if (body.data.enable && body.data.confirmText !== "DONG Y") {
    return err('Để bật chế độ ghi, hãy nhập đúng chữ xác nhận "DONG Y".', 400);
  }
  saveSetting("write_mode", body.data.enable);
  audit("user", body.data.enable ? "write_mode_on" : "write_mode_off", {});
  return ok({ writeMode: body.data.enable });
}
