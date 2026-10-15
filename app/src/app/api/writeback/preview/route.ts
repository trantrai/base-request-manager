export const dynamic = "force-dynamic";

import { z } from "zod";
import { ok, err, sheetsClientOrThrow } from "@/lib/writebackApi";
import { buildWritebackItems } from "@/lib/approvals";
import { buildPreview } from "@/lib/writeback";

const Schema = z.object({ approvalIds: z.array(z.number().int()).min(1).max(200) });

/** Xem trước diff (cũ→mới) — không ghi gì cả. */
export async function POST(req: Request) {
  const body = Schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Dữ liệu không hợp lệ.", 400);
  try {
    const items = buildWritebackItems(body.data.approvalIds);
    if (items.length === 0) return err("Không có dòng nào ở trạng thái đã duyệt.", 400);
    return ok({ preview: buildPreview(items), count: items.length });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
