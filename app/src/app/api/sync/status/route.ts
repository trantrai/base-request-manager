export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { getSyncStatus, getStatusMap } from "@/lib/queries";

export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("what") === "map") return ok(getStatusMap());
  return ok(getSyncStatus());
}
