// M6: mã hoá credential AES-256-GCM.
import { describe, it, expect } from "vitest";
import {
  encryptSecret, decryptSecret, isEncrypted,
  getSecret, saveSecret, migratePlaintextSecrets, resetKeyCache,
} from "../src/lib/secrets";
import { saveSetting } from "../src/lib/queries";
import { getDb } from "../src/lib/db";
import { useTempDb } from "./helpers";

useTempDb();

describe("encrypt/decrypt", () => {
  it("roundtrip AES-256-GCM", () => {
    const enc = encryptSecret("-----BEGIN PRIVATE KEY-----\nabc123");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("abc123");
    expect(decryptSecret(enc)).toBe("-----BEGIN PRIVATE KEY-----\nabc123");
  });
  it("mỗi lần mã hoá cho ciphertext khác nhau (IV ngẫu nhiên)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });
  it("passthrough plaintext cũ (để migrate dần)", () => {
    expect(decryptSecret("plain-key")).toBe("plain-key");
    expect(isEncrypted("plain-key")).toBe(false);
  });
  it("ném lỗi khi định dạng mã hoá sai", () => {
    expect(() => decryptSecret("enc:v1:abc")).toThrow();
  });
});

describe("saveSecret/getSecret", () => {
  it("lưu mã hoá, đọc giải mã đúng", () => {
    saveSecret("sheetsApiKey", "AIza-secret-123");
    const raw = (getDb().prepare("SELECT value_json FROM settings WHERE key='sheetsApiKey'").get() as { value_json: string }).value_json;
    expect(raw).not.toContain("AIza-secret-123");
    expect(isEncrypted(JSON.parse(raw))).toBe(true);
    expect(getSecret("sheetsApiKey")).toBe("AIza-secret-123");
  });
  it("trả undefined khi chưa lưu", () => {
    expect(getSecret("smtpPass")).toBeUndefined();
  });
});

describe("migratePlaintextSecrets", () => {
  it("mã hoá lại secret plaintext cũ + dọn bundle", () => {
    saveSetting("sheetsApiKey", "plain-key-cu");
    saveSetting("__bundle__", { smtpHost: "smtp.gmail.com", sheetsApiKey: "plain-key-cu" });
    const n = migratePlaintextSecrets();
    expect(n).toBeGreaterThanOrEqual(1);
    expect(getSecret("sheetsApiKey")).toBe("plain-key-cu");
    const bundle = JSON.parse(
      (getDb().prepare("SELECT value_json FROM settings WHERE key='__bundle__'").get() as { value_json: string }).value_json
    );
    expect(bundle).not.toHaveProperty("sheetsApiKey");
    expect(bundle.smtpHost).toBe("smtp.gmail.com");
    // idempotent: chạy lại không migrate nữa
    expect(migratePlaintextSecrets()).toBe(0);
  });
});
