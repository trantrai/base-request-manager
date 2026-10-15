// M1: getSmtpConfig đọc từ các key riêng (smtpHost/smtpPort/...), không đọc key 'smtp' gộp.
import { describe, it, expect } from "vitest";
import { getSmtpConfig } from "../src/lib/mail";
import { saveSetting } from "../src/lib/queries";
import { saveSecret } from "../src/lib/secrets";
import { useTempDb } from "./helpers";

useTempDb();

function seedSmtp() {
  saveSetting("smtpHost", "smtp.gmail.com");
  saveSetting("smtpPort", 587);
  saveSetting("smtpUser", "user@gmail.com");
  saveSecret("smtpPass", "app-pass-123");
  saveSetting("smtpFrom", "noreply@laria.vn");
}

describe("getSmtpConfig (M1)", () => {
  it("đọc đủ host/port/user/pass/from từ key riêng", () => {
    seedSmtp();
    const cfg = getSmtpConfig();
    expect(cfg).toMatchObject({
      host: "smtp.gmail.com", port: 587, user: "user@gmail.com",
      pass: "app-pass-123", from: "noreply@laria.vn",
    });
  });
  it("trả null khi thiếu host hoặc from", () => {
    saveSetting("smtpHost", "smtp.gmail.com");
    expect(getSmtpConfig()).toBeNull();
  });
  it("port mặc định 587 khi chưa cấu hình", () => {
    saveSetting("smtpHost", "h");
    saveSetting("smtpFrom", "f@x.vn");
    expect(getSmtpConfig()!.port).toBe(587);
  });
});
