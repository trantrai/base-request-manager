export const dynamic = "force-dynamic";

import { toCsv } from "@/lib/csv";
import { getPending } from "@/lib/queries";
import { getStatusMap } from "@/lib/queries";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("what") === "status-map") {
    const rows = (getStatusMap() as Record<string, unknown>[]).map((r) => ({
      raw_value: r["raw_value"], norm_code: r["norm_code"],
      label_vi: r["label_vi"], severity: r["severity"], version: r["version"],
    }));
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=basescope-status-map.csv",
      },
    });
  }
  const { rows } = getPending({
    tab: u.searchParams.get("tab") ?? undefined,
    status: u.searchParams.get("status") ?? undefined,
    company: u.searchParams.get("company") ?? undefined,
    q: u.searchParams.get("q") ?? undefined,
    page: 1,
    pageSize: 5000,
    unlimited: true, // M2: export lấy tới 5000 dòng, không kẹp 200 như UI
  });
  // export tối đa 5000 dòng đầu để file không quá nặng
  const limited = (rows as Record<string, unknown>[]).map((r) => ({
    tab: r["tab"], key_row: r["key_row"], item_code: r["item_code"],
    created_on: r["created_on"], request_id: r["request_id"], request_name: r["request_name"],
    status_raw: r["status_raw"], status_norm: r["status_norm"],
    company: r["company"], sync_note: r["sync_note"],
  }));
  return new Response(toCsv(limited), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=basescope-pending.csv",
    },
  });
}
