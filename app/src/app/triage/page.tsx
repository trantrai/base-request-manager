"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { StatusChip } from "@/components/StatusChip";

interface Row {
  id: number; tab: string; key_row: string; created_on: string; request_id: string;
  request_name: string; status_raw: string; status_norm: string;
  sync_note: string; company: string; item_code: string;
}

const TABS = ["CreateItem","UpdateItem","UpdatePrice","UpdatePriceMua","UpdatePriceBan","CreateCom_Bom","ItemCom_Bom_D","UpdateStatus","UpdateCOGS","Warehouse","JournalEntry","UpdateSAPInvoice","LockOrUnLockSaleStatus"];
const STATUSES = [["cho_xu_ly","Chờ xử lý"],["loi","Lỗi"],["chuyen_xu_ly","Chuyển xử lý"],["da_duyet","Đã duyệt"]] as const;

function TriageInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [company, setCompany] = useState(sp.get("company") ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: Row[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const u = new URLSearchParams({ page: String(p), pageSize: "50" });
      if (tab) u.set("tab", tab);
      if (status) u.set("status", status);
      if (company) u.set("company", company);
      if (q.trim()) u.set("q", q.trim());
      const r = await fetch(`/api/pending?${u}`);
      const j = await r.json();
      if (j.ok) { setData({ rows: j.data.rows, total: j.data.total }); setPage(p); }
    } finally { setLoading(false); }
  };

  // N9: load() chỉ cần chạy 1 lần khi mount — không đưa vào deps để tránh loop.
  useEffect(() => { load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy 1 lần lúc mount, xem N9 */ }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <>
      <h2 style={{ margin: "0 0 16px" }}>Bảng triage — dòng cần xử lý</h2>
      <div className="card">
        <div className="card-b">
          <div className="toolbar">
            <div className="fld">
              <label className="f" style={{ marginTop: 0 }}>Tab</label>
              <select className="select" value={tab} onChange={(e) => setTab(e.target.value)}>
                <option value="">Tất cả</option>
                {TABS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fld">
              <label className="f" style={{ marginTop: 0 }}>Trạng thái</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Tất cả</option>
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="fld">
              <label className="f" style={{ marginTop: 0 }}>Công ty</label>
              <select className="select" value={company} onChange={(e) => setCompany(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="LARIA">LARIA</option>
                <option value="REUNION">REUNION</option>
              </select>
            </div>
            <div className="fld" style={{ minWidth: 220 }}>
              <label className="f" style={{ marginTop: 0 }}>Từ khóa</label>
              <input className="input" placeholder="Mã hàng, tên request…" value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") load(1); }} />
            </div>
            <div className="fld">
              <label className="f" style={{ marginTop: 0 }}>&nbsp;</label>
              <button className="btn" onClick={() => load(1)}>Lọc</button>
            </div>
            <div className="fld">
              <label className="f" style={{ marginTop: 0 }}>&nbsp;</label>
              <a className="btn btn-ghost" style={{ display: "inline-block", textDecoration: "none" }}
                href={`/api/export?tab=${tab}&status=${status}&company=${company}&q=${encodeURIComponent(q)}`}>
                Xuất CSV
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead>
              <tr><th>Mã hàng</th><th>Tab</th><th>Trạng thái</th><th>Công ty</th><th>Request</th><th>Ghi chú</th><th>Ngày tạo</th></tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.item_code || r.key_row}</td>
                  <td className="small muted">{r.tab}</td>
                  <td><StatusChip norm={r.status_norm} raw={r.status_raw} /></td>
                  <td className="small">{r.company}</td>
                  <td className="small">
                    {r.request_id
                      ? <Link href={`/requests/${encodeURIComponent(r.request_id)}`}>{(r.request_name || r.request_id).slice(0, 50)}</Link>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="small muted">{r.sync_note.slice(0, 80)}</td>
                  <td className="small muted">{(r.created_on || "").slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="card-b"><div className="skeleton" style={{ height: 200 }} /></div>}
          {!loading && data && data.rows.length === 0 && (
            <div className="empty">Không có dòng nào — thử nới filter.</div>
          )}
        </div>
      </div>
      {data && (
        <div className="pager">
          <span>Tổng {data.total.toLocaleString("vi-VN")} dòng — trang {page}/{totalPages}</span>
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => load(page - 1)}>Trước</button>
          <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => load(page + 1)}>Sau</button>
        </div>
      )}
    </>
  );
}

export default function TriagePage() {
  return (
    <Suspense fallback={<div className="empty">Đang tải…</div>}>
      <TriageInner />
    </Suspense>
  );
}
