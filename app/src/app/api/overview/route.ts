export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { getOverview } from "@/lib/queries";

export async function GET() {
  return ok(getOverview());
}
