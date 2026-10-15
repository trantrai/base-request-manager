// Gửi email cảnh báo qua SMTP do user cấu hình trong Settings.
// Không hardcode credential — mọi thứ đọc từ bảng settings.

import nodemailer from "nodemailer";
import { getDb } from "./db";
import { getSettings } from "./queries";
import { getSecret } from "./secrets";

interface SmtpCfg {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** M1: đọc từ các key riêng (smtpHost/smtpPort/...) — key 'smtp' gộp không tồn tại. */
export function getSmtpConfig(): SmtpCfg | null {
  const s = getSettings();
  const host = (s["smtpHost"] as string) || "";
  const from = (s["smtpFrom"] as string) || "";
  if (!host || !from) return null;
  return {
    host,
    port: Number(s["smtpPort"]) || 587,
    user: (s["smtpUser"] as string) || "",
    pass: getSecret("smtpPass") || "",
    from,
  };
}

export interface AlertMail {
  to: string;
  subject: string;
  html: string;
}

/** Gửi 1 email cảnh báo. Ném lỗi nếu SMTP chưa cấu hình. */
export async function sendAlert(mail: AlertMail): Promise<void> {
  const cfg = getSmtpConfig();
  if (!cfg) throw new Error("Chưa cấu hình SMTP trong trang Cài đặt.");
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transporter.sendMail({ from: cfg.from, to: mail.to, subject: mail.subject, html: mail.html });
  getDb()
    .prepare("INSERT INTO audit_log(actor, action, detail_json) VALUES ('system','email_sent',?)")
    .run(JSON.stringify({ to: mail.to, subject: mail.subject }));
}
