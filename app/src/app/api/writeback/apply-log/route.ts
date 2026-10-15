export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { getApplyLog } from "@/lib/approvals";

export async function GET(req: Request) {
  const u = new URL(req.url);
  return ok(getApplyLog(u.searchParams.get("batch") ?? undefined));
}
