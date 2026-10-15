export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { getPending } from "@/lib/queries";

export async function GET(req: Request) {
  const u = new URL(req.url);
  return ok(
    getPending({
      tab: u.searchParams.get("tab") ?? undefined,
      status: u.searchParams.get("status") ?? undefined,
      company: u.searchParams.get("company") ?? undefined,
      q: u.searchParams.get("q") ?? undefined,
      page: Number(u.searchParams.get("page") ?? "1"),
      pageSize: Number(u.searchParams.get("pageSize") ?? "50"),
    })
  );
}
