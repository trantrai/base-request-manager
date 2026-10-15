"use client";

import { useEffect, useState } from "react";
import { StatusChip } from "@/components/StatusChip";

interface Approval {
  id: number; line_id: number; proposed_status: string; proposed_note: string;
  reason: string; rule_code: string; state: string; created_at: string;
  decided_by: string; decided_at: string | null;
  tab: string; key_row: string; item_code: string; request_id: string;
  request_name: string; status_raw: string; status_norm: string;
  sync_note: string; company: string; created_on: string;
}

interface PreviewRow {
  approvalId: number; tab: string; keyRow: string; sheetRange: string;
  field: string; oldValue: string; newValue: string;
}

interface BatchSummary {
  batch_id: string; applied_at: string; applied_by: string;
  total: number; applied: number; rolled_back: number; failed: number;
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) } });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Lỗi không xác định");
  return j.data as T;
}

export default function PheDuyetPage() {
  const [tab, setTab] = useState<"queue" | "log">("queue");
  const [state, setState] = useState("proposed");
  const [rows, setRows] = useState<Approval[]>([]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  // M3: snapshot tập approvalIds đúng lúc bấm "Xem trước" — nút "Áp dụng"
  // dùng snapshot này, không dùng checkbox hiện tại (user có thể tích thêm/bớt sau preview).
  const [previewIds, setPreviewIds] = useState<number[] | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeMode, setWriteMode] = useState(false);
  // N18: dialog xác nhận hoàn tác inline (thay window.confirm — thân thiện screen reader hơn)
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await api<Approval[]>(`/api/approvals?state=${state}`));
      setChecked(new Set());
      const s = await api<{ writeMode: boolean }>(`/api/settings`);
      setWriteMode(!!s.writeMode);
      setBatches(await api<BatchSummary[]>(`/api/writeback/apply-log`));
    } catch (e) { setMsg({ kind: "error", text: (e as Error).message }); }
  };

  // N9: load() đọc `state` từ closure — cố ý chỉ chạy lại khi `state` đổi,
  // không đưa vào deps để tránh vòng lặp khi load tự setChecked.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps -- chạy lại khi state đổi, xem N9 */ }, [state]);

  const say = (kind: string, text: string) => setMsg({ kind, text });

  const detect = async () => {
    setBusy(true);
    try {
      const r = await api<{ created: number }>(`/api/approvals`, {
        method: "POST", body: JSON.stringify({ action: "detect" }),
      });
      say("info", `Đã quét xong — tạo ${r.created} đề xuất mới.`);
      setState("proposed"); await load();
    } catch (e) { say("error", (e as Error).message); } finally { setBusy(false); }
  };

  const decide = async (id: number, st: "approved" | "rejected") => {
    try {
      await api(`/api/approvals`, { method: "POST", body: JSON.stringify({ id, state: st, decidedBy: "user" }) });
      await load();
    } catch (e) { say("error", (e as Error).message); }
  };

  // N8: duyệt theo batch 10 request song song (thay vì await tuần tự 123 lần)
  const decideSelected = async (st: "approved" | "rejected") => {
    setBusy(true);
    try {
      const ids = Array.from(checked);
      const BATCH = 10;
      let okCount = 0;
      const errors: string[] = [];
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          chunk.map((id) => api(`/api/approvals`, {
            method: "POST", body: JSON.stringify({ id, state: st, decidedBy: "user" }),
          }))
        );
        results.forEach((r, j) => {
          if (r.status === "fulfilled") okCount++;
          else errors.push(`#${chunk[j]}: ${(r.reason as Error)?.message ?? "lỗi"}`);
        });
      }
      say(errors.length ? "warn" : "info",
        `Đã ${st === "approved" ? "duyệt" : "từ chối"} ${okCount}/${ids.length} dòng.` +
        (errors.length ? ` Lỗi: ${errors.slice(0, 5).join("; ")}${errors.length > 5 ? "…" : ""}` : ""));
      setState(st === "approved" ? "approved" : "rejected");
      await load();
    } catch (e) { say("error", (e as Error).message); } finally { setBusy(false); }
  };

  const showPreview = async () => {
    setBusy(true);
    try {
      // M3: chốt tập approvalIds đúng lúc preview (khử trùng, snapshot)
      const ids = Array.from(new Set(checked));
      const r = await api<{ preview: PreviewRow[] }>(`/api/writeback/preview`, {
        method: "POST", body: JSON.stringify({ approvalIds: ids }),
      });
      setPreview(r.preview);
      setPreviewIds(ids); // M3: chốt tập dòng đúng lúc preview
    } catch (e) { say("error", (e as Error).message); } finally { setBusy(false); }
  };

  const apply = async () => {
    if (confirmText.trim().toUpperCase() !== "DONG Y") {
      say("error", 'Hãy nhập đúng chữ "DONG Y" để xác nhận áp dụng.');
      return;
    }
    if (!previewIds || previewIds.length === 0) {
      say("error", "Hãy bấm “Xem trước thay đổi” trước khi áp dụng.");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ batchId: string; applied: number; failed: { keyRow: string; error: string }[] }>(
        `/api/writeback/apply`,
        // M3: áp dụng đúng tập đã preview, bất kể checkbox hiện tại
        { method: "POST", body: JSON.stringify({ approvalIds: previewIds, confirmed: true, appliedBy: "user" }) },
      );
      say(r.failed.length ? "warn" : "info",
        `Đã áp dụng ${r.applied} dòng (đợt ${r.batchId}).` +
        (r.failed.length ? ` Thất bại ${r.failed.length}: ${r.failed.map((f) => f.keyRow).join(", ")}` : ""));
      setPreview(null); setPreviewIds(null); setConfirmText("");
      setTab("log"); await load();
    } catch (e) { say("error", (e as Error).message); } finally { setBusy(false); }
  };

  const rollback = async (batchId: string) => {
    setBusy(true);
    try {
      const r = await api<{ rolledBack: number; failed: number }>(`/api/writeback/rollback/${encodeURIComponent(batchId)}`, { method: "POST" });
      say("info", `Đã hoàn tác ${r.rolledBack} dòng${r.failed ? `, thất bại ${r.failed}` : ""}.`);
      setRollbackTarget(null);
      await load();
    } catch (e) { say("error", (e as Error).message); } finally { setBusy(false); }
  };

  const toggleCheck = (id: number) => {
    const n = new Set(checked);
    if (n.has(id)) n.delete(id); else n.add(id);
    setChecked(n);
    // M3: đổi checkbox sau preview -> preview cũ hết hiệu lực
    setPreview(null);
    setPreviewIds(null);
  };

  return (
    <>
      <h2 style={{ margin: "0 0 16px" }}>Phê duyệt & Áp dụng</h2>
      {msg && <div className={`alert alert-${msg.kind === "error" ? "error" : msg.kind === "warn" ? "warn" : "info"}`}>{msg.text}</div>}
      {!writeMode && (
        <div className="alert alert-info">
          Ứng dụng đang ở <b>chế độ chỉ-đọc</b> — nút "Áp dụng" bị khóa. Muốn ghi lên Sheets, hãy bật toggle trong trang Cài đặt.
        </div>
      )}

      <div className="toolbar">
        <button className={`btn ${tab === "queue" ? "" : "btn-ghost"}`} onClick={() => setTab("queue")}>Hàng đợi duyệt</button>
        <button className={`btn ${tab === "log" ? "" : "btn-ghost"}`} onClick={() => setTab("log")}>Lịch sử áp dụng</button>
      </div>

      {tab === "queue" && (
        <>
          <div className="toolbar">
            <button className="btn btn-ghost" disabled={busy} onClick={detect}>Quét ứng viên dọn dẹp</button>
            <div className="fld">
              <select className="select" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="proposed">Chờ duyệt</option>
                <option value="approved">Đã duyệt</option>
                <option value="rejected">Đã từ chối</option>
              </select>
            </div>
            {checked.size > 0 && (
              <>
                <button className="btn" disabled={busy} onClick={() => decideSelected("approved")}>Duyệt {checked.size} dòng</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => decideSelected("rejected")}>Từ chối</button>
                {state === "approved" && (
                  <button className="btn btn-warn" disabled={busy} onClick={showPreview}>Xem trước thay đổi</button>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div style={{ overflowX: "auto" }}>
              <table className="grid">
                <thead><tr><th></th><th>Mã hàng</th><th>Hiện tại</th><th>Đề xuất</th><th>Lý do</th><th>Request</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td><input type="checkbox" checked={checked.has(r.id)} onChange={() => toggleCheck(r.id)}
                        aria-label={`Chọn dòng ${r.item_code || r.key_row} (${r.tab})`} /></td>
                      <td className="mono">{r.item_code || r.key_row}<div className="small muted">{r.tab}</div></td>
                      <td><StatusChip norm={r.status_norm} raw={r.status_raw} /></td>
                      <td><span className="chip chip-hoan_tat">{r.proposed_status}</span></td>
                      <td className="small muted">{r.reason.slice(0, 120)}</td>
                      <td className="small">{(r.request_name || r.request_id || "—").slice(0, 40)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <div className="empty">Chưa có đề xuất nào — bấm "Quét ứng viên dọn dẹp".</div>}
            </div>
          </div>

          {preview && (
            <div className="card">
              <div className="card-h">Xem trước thay đổi ({preview.length} dòng)</div>
              <div className="card-b">
                <table className="grid">
                  <thead><tr><th>Mã hàng</th><th>Ô trên Sheets</th><th>Giá trị cũ</th><th>Giá trị mới</th></tr></thead>
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.approvalId}>
                        <td className="mono">{p.keyRow}</td>
                        <td className="mono small">{p.sheetRange}</td>
                        <td><span className="diff-old">{p.oldValue}</span></td>
                        <td><span className="diff-new">{p.newValue}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input className="input" style={{ maxWidth: 200 }} placeholder='Nhập "DONG Y" để xác nhận'
                    value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                  <button className="btn btn-danger" disabled={busy || !writeMode} onClick={apply}>
                    Áp dụng đợt đã duyệt
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setPreview(null); setPreviewIds(null); }}>Hủy</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "log" && (
        <div className="card">
          <div className="card-h">Lịch sử các đợt áp dụng</div>
          {rollbackTarget && (
            <div className="card-b" role="alertdialog" aria-modal="false"
              aria-label="Xác nhận hoàn tác" style={{ borderBottom: "1px solid var(--border)" }}>
              <p style={{ margin: "0 0 12px" }}>
                Hoàn tác toàn bộ đợt <span className="mono">{rollbackTarget}</span>? Các ô sẽ được ghi ngược về giá trị cũ.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-danger" disabled={busy} onClick={() => rollback(rollbackTarget)}>
                  Xác nhận hoàn tác
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => setRollbackTarget(null)}>Hủy</button>
              </div>
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table className="grid">
              <thead><tr><th>Đợt (batch)</th><th>Thời gian</th><th>Người áp dụng</th><th>Tổng</th><th>Đã ghi</th><th>Hoàn tác</th><th>Lỗi</th><th></th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch_id}>
                    <td className="mono small">{b.batch_id}</td>
                    <td className="small muted">{(b.applied_at || "").replace("T", " ").slice(0, 19)}</td>
                    <td className="small">{b.applied_by}</td>
                    <td className="mono">{b.total}</td>
                    <td className="mono">{b.applied}</td>
                    <td className="mono">{b.rolled_back}</td>
                    <td className="mono">{b.failed}</td>
                    <td>
                      {b.applied > 0 && (
                        <button className="btn btn-ghost" disabled={busy || !writeMode} onClick={() => setRollbackTarget(b.batch_id)}>
                          Hoàn tác đợt này
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {batches.length === 0 && <div className="empty">Chưa có đợt áp dụng nào.</div>}
          </div>
        </div>
      )}
    </>
  );
}
