"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SearchRow {
  id: number; tab: string; key_row: string; request_id: string;
  request_name: string; status_norm: string; company: string; item_code: string;
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Lỗi không xác định");
  return j.data as T;
}

export function Topbar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [writeMode, setWriteMode] = useState(false);
  const [syncAt, setSyncAt] = useState("");
  const router = useRouter();

  const refreshMeta = useCallback(async () => {
    try {
      const s = await api<{ writeMode: boolean; settings: Record<string, unknown> }>("/api/settings");
      setWriteMode(!!s.writeMode);
    } catch { /* bỏ qua */ }
    try {
      const st = await api<{ last?: { finished_at?: string } }>("/api/sync/status");
      setSyncAt(st.last?.finished_at ?? "");
    } catch { /* bỏ qua */ }
  }, []);

  useEffect(() => {
    refreshMeta();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshMeta]);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setRows([]); return; }
    const t = setTimeout(async () => {
      try { setRows(await api<SearchRow[]>(`/api/search?q=${encodeURIComponent(q.trim())}`)); }
      catch { setRows([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const goRequest = (requestId: string) => {
    setOpen(false); setQ("");
    router.push(`/requests/${encodeURIComponent(requestId)}`);
  };

  return (
    <>
      <header className="topbar">
        <button className="btn btn-ghost" onClick={() => setOpen(true)} title="Tìm kiếm toàn cục (Ctrl+K)">
          Tìm kiếm (Ctrl+K)
        </button>
        <span className={`mode-badge ${writeMode ? "mode-write" : "mode-read"}`}>
          {writeMode ? "GHI CÓ KIỂM SOÁT" : "CHỈ ĐỌC"}
        </span>
        {syncAt && <span className="sync-note">Đồng bộ lần cuối: {syncAt.replace("T", " ").slice(0, 19)}</span>}
      </header>
      {open && (
        <div className="palette-overlay" onClick={() => setOpen(false)}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Mã hàng, tên hàng, RequestId, tên request… (gõ ít nhất 2 ký tự)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && rows.length > 0) goRequest(rows[0].request_id || rows[0].key_row); }}
            />
            <div className="results">
              {rows.map((r) => (
                <div key={r.id} className="row" onClick={() => goRequest(r.request_id || r.key_row)}>
                  <span className="mono">{r.item_code || r.key_row}</span>
                  <span className="small muted">{r.tab}</span>
                  <span className="small" style={{ marginLeft: "auto" }}>
                    {(r.request_name || "").slice(0, 60)}
                  </span>
                </div>
              ))}
              {q.trim().length >= 2 && rows.length === 0 && (
                <div className="empty">Không tìm thấy — thử từ khóa khác.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
