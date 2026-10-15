import Link from "next/link";
import { getOverview } from "@/lib/queries";
import { StatusChip } from "@/components/StatusChip";

export const dynamic = "force-dynamic";

const NORM_ORDER = ["cho_xu_ly", "loi", "chuyen_xu_ly", "da_duyet", "hoan_tat", "da_go", "khac"];

export default function Dashboard() {
  const ov = getOverview();
  return (
    <>
      <h2 style={{ margin: "0 0 16px" }}>Tổng quan</h2>
      <div className="kpis">
        <Link className="kpi" href="/triage" style={{ textDecoration: "none" }}>
          <div className="label">Tổng số dòng</div>
          <div className="value">{ov.total.toLocaleString("vi-VN")}</div>
        </Link>
        <Link className="kpi warn" href="/triage" style={{ textDecoration: "none" }}>
          <div className="label">Cần xử lý</div>
          <div className="value">{ov.pending.toLocaleString("vi-VN")}</div>
        </Link>
        <Link className="kpi error" href="/triage?status=loi" style={{ textDecoration: "none" }}>
          <div className="label">Lỗi</div>
          <div className="value">{(ov.byNorm["loi"] ?? 0).toLocaleString("vi-VN")}</div>
        </Link>
        <Link className="kpi warn" href="/triage?status=cho_xu_ly" style={{ textDecoration: "none" }}>
          <div className="label">Chờ xử lý</div>
          <div className="value">{(ov.byNorm["cho_xu_ly"] ?? 0).toLocaleString("vi-VN")}</div>
        </Link>
      </div>

      <div className="card">
        <div className="card-h">Theo tab</div>
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>Tab</th><th>Tổng dòng</th><th>Cần xử lý</th><th></th></tr></thead>
            <tbody>
              {ov.byTab.map((t) => (
                <tr key={t.tab}>
                  <td className="mono">{t.tab}</td>
                  <td className="mono">{t.total.toLocaleString("vi-VN")}</td>
                  <td className="mono">{t.pending.toLocaleString("vi-VN")}</td>
                  <td><Link href={`/triage?tab=${t.tab}`}>Xem</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h">Theo công ty</div>
        <div style={{ overflowX: "auto" }}>
          <table className="grid">
            <thead><tr><th>Công ty</th><th>Tổng dòng</th><th>Cần xử lý</th><th></th></tr></thead>
            <tbody>
              {ov.byCompany.map((c) => (
                <tr key={c.company}>
                  <td>{c.company}</td>
                  <td className="mono">{c.total.toLocaleString("vi-VN")}</td>
                  <td className="mono">{c.pending.toLocaleString("vi-VN")}</td>
                  <td><Link href={`/triage?company=${encodeURIComponent(c.company)}`}>Xem</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-h">Phân bố trạng thái (đã chuẩn hoá)</div>
        <div className="card-b" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {NORM_ORDER.filter((n) => ov.byNorm[n]).map((n) => (
            <Link key={n} href={`/triage?status=${n}`} style={{ textDecoration: "none" }}>
              <StatusChip norm={n} /> <span className="mono">{ov.byNorm[n].toLocaleString("vi-VN")}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
