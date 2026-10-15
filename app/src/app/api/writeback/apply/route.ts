export const dynamic = "force-dynamic";

import { z } from "zod";
import { ok, err, sheetsClientOrThrow, makeRowResolver } from "@/lib/writebackApi";
import { buildWritebackItems, applyBatch } from "@/lib/approvals";
import { isWriteMode } from "@/lib/queries";

const Schema = z.object({
  approvalIds: z.array(z.number().int()).min(1).max(200),
  confirmed: z.literal(true),
  appliedBy: z.string().max(100).default("user"),
});

/** Áp dụng đợt đã duyệt — chỉ khi write_mode bật + đã xác nhận. */
export async function POST(req: Request) {
  if (!isWriteMode()) return err("Ứng dụng đang ở chế độ chỉ-đọc (write_mode tắt).", 403);
  const body = Schema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return err("Thiếu xác nhận. Hãy xem trước thay đổi và xác nhận trước khi áp dụng.", 400);
  try {
    const items = buildWritebackItems(body.data.approvalIds);
    const client = sheetsClientOrThrow();
    const result = await applyBatch(
      items,
      { confirmed: true, appliedBy: body.data.appliedBy },
      client,
      await makeRowResolver(client),
    );
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
