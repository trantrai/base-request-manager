export const dynamic = "force-dynamic";

import { ok, err, checkSameOrigin, serverError, sheetsClientOrThrow } from "@/lib/writebackApi";
import { rollbackBatch } from "@/lib/approvals";
import { isWriteMode } from "@/lib/queries";

/** Hoàn tác 1 đợt đã áp dụng (ghi ngược giá trị cũ). */
export async function POST(req: Request, ctx: { params: Promise<{ batchId: string }> }) {
  if (!checkSameOrigin(req)) return err("Yêu cầu không hợp lệ.", 403);
  if (!isWriteMode()) return err("Ứng dụng đang ở chế độ chỉ-đọc (write_mode tắt).", 403);
  const { batchId } = await ctx.params;
  try {
    const result = await rollbackBatch(decodeURIComponent(batchId), { appliedBy: "user" }, sheetsClientOrThrow());
    return ok(result);
  } catch (e) {
    return serverError(e, "Hoàn tác thất bại. Vui lòng thử lại.");
  }
}
