export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { searchGlobal } from "@/lib/queries";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return ok([]);
  return ok(searchGlobal(q));
}
