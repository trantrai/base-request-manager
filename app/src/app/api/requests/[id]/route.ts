export const dynamic = "force-dynamic";

import { ok, err } from "@/lib/api";
import { getRequestDetail } from "@/lib/queries";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const decoded = decodeURIComponent(id);
  const { rows, agg } = getRequestDetail(decoded);
  if (rows.length === 0) return err("Không tìm thấy request.", 404);
  return ok({ rows, agg });
}
