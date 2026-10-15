export const dynamic = "force-dynamic";

import { ok, err, sheetsClientOrThrow } from "@/lib/writebackApi";
import { rollbackBatch } from "@/lib/approvals";
import { isWriteMode } from "@/lib/queries";

/** Hoàn tác 1 đợt đã áp dụng (ghi ngược giá trị cũ). */
export async function POST(_req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  if (!isWriteMode()) return err("Ứng dụng đang ở chế độ chỉ-đọc (write_mode tắt).", 403);
  const { batchId } = await ctx.params;
  try {
    const result = await rollbackBatch(decodeURIComponent(batchId), { appliedBy: "user" }, sheetsClientOrThrow());
    return ok(result);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 500);
  }
}
