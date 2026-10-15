"use client";

import { useEffect, useState } from "react";

interface Settings { [k: string]: unknown }

export default function CaiDatPage() {
  const [s, setS] = useState<Settings>({});
  const [writeMode, setWriteMode] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await fetch("/api/settings");
    const j = await r.json();
    if (j.ok) { setS(j.data.settings ?? {}); setWriteMode(!!j.data.writeMode); }
  };
  useEffect(() => { load(); }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setS((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: s["spreadsheetId"] ?? "1bfSU5RQ2FZccs4rea8WrxKSyW0HsP7ntuOuL67rATw0",
          sheetsAuthType: s["sheetsAuthType"] ?? "",
          sheetsApiKey: s["sheetsApiKey"] ?? "",
          sheetsSaEmail: s["sheetsSaEmail"] ?? "",
          sheetsSaKey: s["sheetsSaKey"] ?? "",
          smtpHost: s["smtpHost"] ?? "", smtpPort: Number(s["smtpPort"] ?? 587),
          smtpUser: s["smtpUser"] ?? "", smtpPass: s["smtpPass"] ?? "",
          smtpFrom: s["smtpFrom"] ?? "", alertTo: s["alertTo"] ?? "",
        }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setMsg({ kind: "info", text: "Đã lưu cài đặt." });
      await load();
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const toggleWrite = async (enable: boolean) => {
    setBusy(true);
    try {
      const r = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable, confirmText: enable ? confirmText : undefined }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setWriteMode(j.data.writeMode);
      setConfirmText("");
      setMsg({ kind: "info", text: j.data.writeMode ? "Đã BẬT chế độ ghi có kiểm soát." : "Đã TẮT — về chế độ chỉ-đọc." });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const testMail = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/settings/test-mail", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setMsg({ kind: "info", text: `Đã gửi email kiểm tra tới ${j.data.to}.` });
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const v = (k: string) => (s[k] as string) ?? "";

  return (
    <>
      <h2 style={{ margin: "0 0 16px" }}>Cài đặt</h2>
      {msg && <div className={`alert alert-${msg.kind === "error" ? "error" : "info"}`}>{msg.text}</div>}

      <div className="card">
        <div className="card-h">Chế độ ghi</div>
        <div className="card-b">
          <p>
            Hiện tại: <span className={`mode-badge ${writeMode ? "mode-write" : "mode-read"}`}>
              {writeMode ? "GHI CÓ KIỂM SOÁT" : "CHỈ ĐỌC"}
            </span>
          </p>
          {!writeMode ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input className="input" style={{ maxWidth: 200 }} placeholder='Nhập "DONG Y" để bật'
                value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              <button className="btn btn-warn" disabled={busy} onClick={() => toggleWrite(true)}>
                Bật ghi có kiểm soát
              </button>
            </div>
          ) : (
            <button className="btn" disabled={busy} onClick={() => toggleWrite(false)}>Tắt — về chỉ-đọc</button>
          )}
          <p className="small muted">Khi bật, các nút "Áp dụng"/"Hoàn tác" trong trang Phê duyệt mới hoạt động. Mọi lần ghi đều vào apply_log.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h">Kết nối Google Sheets</div>
        <div className="card-b">
          <label className="f">Spreadsheet ID</label>
          <input className="input mono" value={v("spreadsheetId")} onChange={set("spreadsheetId")}
            placeholder="1bfSU5RQ2FZccs4rea8WrxKSyW0HsP7ntuOuL67rATw0" />
          <label className="f">Kiểu xác thực</label>
          <select className="select" value={v("sheetsAuthType")} onChange={set("sheetsAuthType")}>
            <option value="">— Chưa cấu hình —</option>
            <option value="api_key">API key (chỉ đọc)</option>
            <option value="service_account">Service account (đọc + ghi)</option>
          </select>
          {v("sheetsAuthType") === "api_key" && (
            <><label className="f">API key</label>
            <input className="input mono" type="password" value={v("sheetsApiKey")} onChange={set("sheetsApiKey")}
              placeholder={v("sheetsApiKey") === "•••đã lưu•••" ? "Đã lưu — nhập mới để thay đổi" : "AIza…"} /></>
          )}
          {v("sheetsAuthType") === "service_account" && (
            <>
              <label className="f">Service account email</label>
              <input className="input mono" value={v("sheetsSaEmail")} onChange={set("sheetsSaEmail")}
                placeholder="ten@project.iam.gserviceaccount.com" />
              <label className="f">Private key (-----BEGIN PRIVATE KEY-----…)</label>
              <textarea className="input mono" rows={4} value={v("sheetsSaKey")} onChange={set("sheetsSaKey")}
                placeholder={v("sheetsSaKey") === "•••đã lưu•••" ? "Đã lưu — dán mới để thay đổi" : "Dán private key…"} />
              <p className="small muted">Chia sẻ file Sheets cho service account email với quyền Viewer (chỉ đọc) hoặc Editor (nếu dùng write-back).</p>
            </>
          )}
          <p className="small muted">Xem hướng dẫn lấy credential trong <code className="inline">HUONG-DAN-CREDENTIAL.md</code>.</p>
          <div className="alert alert-info" style={{ marginTop: 12 }}>
            <b>Bảo mật (M6):</b> API key, private key và SMTP password được mã hoá AES-256-GCM
            bằng key máy (<code className="inline">machine.key</code> ngoài thư mục app) trước khi lưu vào database.
            Dù vậy, file <code className="inline">data/basescope.db</code> vẫn cần được bảo vệ —
            không gửi/đính kèm lung tung, không commit lên git.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h">Email cảnh báo (SMTP)</div>
        <div className="card-b">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label className="f" style={{ marginTop: 0 }}>SMTP host</label>
              <input className="input" value={v("smtpHost")} onChange={set("smtpHost")} placeholder="smtp.gmail.com" /></div>
            <div><label className="f" style={{ marginTop: 0 }}>Port</label>
              <input className="input" value={v("smtpPort")} onChange={set("smtpPort")} placeholder="587" /></div>
            <div><label className="f" style={{ marginTop: 0 }}>Username</label>
              <input className="input" value={v("smtpUser")} onChange={set("smtpUser")} /></div>
            <div><label className="f" style={{ marginTop: 0 }}>Password / App password</label>
              <input className="input" type="password" value={v("smtpPass")} onChange={set("smtpPass")}
                placeholder={v("smtpPass") === "•••đã lưu•••" ? "Đã lưu" : ""} /></div>
            <div><label className="f" style={{ marginTop: 0 }}>Email người gửi (From)</label>
              <input className="input" value={v("smtpFrom")} onChange={set("smtpFrom")} /></div>
            <div><label className="f" style={{ marginTop: 0 }}>Email nhận cảnh báo</label>
              <input className="input" value={v("alertTo")} onChange={set("alertTo")} placeholder="trai@… " /></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-ghost" disabled={busy} onClick={testMail}>Gửi email kiểm tra</button>
          </div>
        </div>
      </div>

      <button className="btn" disabled={busy} onClick={save}>Lưu cài đặt</button>
    </>
  );
}
