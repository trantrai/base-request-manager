"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "@/components/StatusChip";

interface Run {
  id: number; started_at: string; finished_at: string | null; duration_ms: number;
  tabs_ok: number; tabs_fail: number; rows_read: number; rows_upserted: number;
  rows_junk: number; status: string; error: string;
}
interface MapRow { raw_value: string; norm_code: string; label_vi: string; severity: string; version: number; }

export default function TrangThaiPage() {
  const [last, setLast] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [map, setMap] = useState<MapRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const r = await fetch("/api/sync/status");
    const j = await r.json();
    if (j.ok) { setLast(j.data.last ?? null); setHistory(j.data.history ?? []); }
    const m = await fetch("/api/sync/status?what=map");
    const jm = await m.json();
    if (jm.ok) setMap(jm.data);
  };

  useEffect(() => { load(); }, []);

  const trigger = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/sync/trigger", { method: "POST" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      setMsg(`Đồng bộ xong: ${j.data.tabsOk} tab OK, ${j.data.rowsUpserted.toLocaleString("vi-VN")} dòng.`);
      await load();
    } catch (e) { setMsg("Lỗi: " + (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h2 style={{ margin: "0 0 16px" }}>Trạng thái đồng bộ</h2>
      {msg && <div className={`alert ${msg.startsWith("Lỗi") ? "alert-error" : "alert-info"}`}>{msg}</div>}

      <div className="card">
        <div className="card-h">Lần đồng bộ gần nhất</div>
        <div className="card-b">
          {last ? (
            <dl className="kv">
              <dt>Bắt đầu</dt><dd className="mono">{(last.started_at || "").replace("T", " ").slice(0, 19)}</dd>
              <dt>Kết thúc</dt><dd className="mono">{(last.finished_at || "—").replace("T", " ").slice(0, 19)}</dd>
              <dt>Thời gian</dt><dd>{(last.duration_ms / 1000).toFixed(1)} giây</dd>
              <dt>Tab</dt><dd>{last.tabs_ok} OK / {last.tabs_fail} lỗi</dd>
              <dt>Dòng đọc</dt><dd className="mono">{last.rows_read.toLocaleString("vi-VN")}</dd>
              <dt>Dòng upsert</dt><dd className="mono">{last.rows_upserted.toLocaleString("vi-VN")}</dd>
              <dt>Dòng rác loại</dt><dd className="mono">{last.rows_junk.toLocaleString("vi-VN")}</dd>
              <dt>Trạng thái</dt><dd>{last.status}</dd>
              {last.error && <><dt>Lỗi</dt><dd className="small" style={{ color: "var(--coral)" }}>{last.error}</dd></>}
            </dl>
          ) : <div className="empty">Chưa có lần đồng bộ nào.</div>}
          <button className="btn" disabled={busy} onClick={trigger}>
            {busy ? "Đang đồng bộ…" : "Đồng bộ ngay"}
          </button>
          <p className="small muted">Đồng bộ đọc 13 tab từ Google Sheets (cần cấu hình credential trong Cài đặt). Mặc định 20 phút/lần khi chạy kèm scheduler.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h">Lịch sử đồng bộ</div>
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>#</th><th>Bắt đầu</th><th>Tab OK</th><th>Dòng upsert</th><th>Rác loại</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="mono">{h.id}</td>
                  <td className="small muted">{(h.started_at || "").replace("T", " ").slice(0, 19)}</td>
                  <td className="mono">{h.tabs_ok}/{h.tabs_ok + h.tabs_fail}</td>
                  <td className="mono">{h.rows_upserted.toLocaleString("vi-VN")}</td>
                  <td className="mono">{h.rows_junk.toLocaleString("vi-VN")}</td>
                  <td className="small">{h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h">Bảng chuẩn hoá trạng thái (công khai, versioned)</div>
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>Giá trị thô trên Sheets</th><th>Chuẩn hoá</th><th>Nhãn tiếng Việt</th><th>Mức</th><th>Version</th></tr></thead>
            <tbody>
              {map.map((m) => (
                <tr key={m.raw_value}>
                  <td className="mono">{m.raw_value}</td>
                  <td><StatusChip norm={m.norm_code} /></td>
                  <td>{m.label_vi}</td>
                  <td className="small muted">{m.severity}</td>
                  <td className="mono">{m.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-b">
          <a className="btn btn-ghost" style={{ textDecoration: "none" }} href="/api/export?what=status-map">Xuất CSV bảng này</a>
        </div>
      </div>
    </>
  );
}
