// Gửi email cảnh báo qua SMTP do user cấu hình trong Settings.
// Không hardcode credential — mọi thứ đọc từ bảng settings.

import nodemailer from "nodemailer";
import { getDb } from "./db";

interface SmtpCfg {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function getSmtpConfig(): SmtpCfg | null {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM settings WHERE key='smtp'").get() as
    | { value_json: string }
    | undefined;
  if (!row) return null;
  const cfg = JSON.parse(row.value_json) as SmtpCfg;
  if (!cfg.host || !cfg.from) return null;
  return cfg;
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
