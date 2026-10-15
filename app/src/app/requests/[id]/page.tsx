import Link from "next/link";
import { getRequestDetail } from "@/lib/queries";
import { StatusChip } from "@/components/StatusChip";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const { rows, agg } = getRequestDetail(decoded);
  if (rows.length === 0) {
    return <><h2>Không tìm thấy request</h2><p className="muted">ID: <code className="inline">{decoded}</code></p><Link href="/triage">Về bảng triage</Link></>;
  }
  const first = rows[0] as Record<string, unknown>;
  const baseLink = /^https?:\/\//.test(decoded) ? decoded : null;
  const tabs = Array.from(new Set(rows.map((r) => (r as Record<string, unknown>)["tab"])));

  return (
    <>
      <p><Link href="/triage">← Bảng triage</Link></p>
      <h2 style={{ margin: "0 0 4px" }}>{String(first["request_name"] || decoded).slice(0, 100)}</h2>
      <p className="muted small">
        <code className="inline">{decoded}</code> · {rows.length} dòng · tab: {tabs.join(", ")}
        {baseLink && <> · <a href={baseLink} target="_blank" rel="noopener noreferrer">Mở trên base.vn</a></>}
      </p>
      {agg && (
        <div className="card"><div className="card-b small">
          Công ty: <b>{String(agg["company"] || "—")}</b> · Cần xử lý: <b>{String(agg["lines_pending"])}</b>/{String(agg["lines_total"])} dòng ·
          Từ {(agg["min_created"] as string || "").slice(0, 10)} đến {(agg["max_created"] as string || "").slice(0, 10)}
        </div></div>
      )}
      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>Mã hàng</th><th>Tab</th><th>Trạng thái</th><th>Ghi chú</th><th>Ngày tạo</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const x = r as Record<string, unknown>;
                return (
                  <tr key={x["id"] as number}>
                    <td className="mono">{String(x["item_code"] || x["key_row"])}</td>
                    <td className="small muted">{String(x["tab"])}</td>
                    <td><StatusChip norm={String(x["status_norm"])} raw={String(x["status_raw"])} /></td>
                    <td className="small muted">{String(x["sync_note"] || "").slice(0, 100)}</td>
                    <td className="small muted">{String(x["created_on"] || "").slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
