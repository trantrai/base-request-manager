export const dynamic = "force-dynamic";

import { ok, err } from "@/lib/api";
import { getDb } from "@/lib/db";
import { listApprovals, autoDetect, audit } from "@/lib/approvals";
import { z } from "zod";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const state = u.searchParams.get("state") ?? undefined;
  return ok(listApprovals(state));
}

const DecideSchema = z.object({
  id: z.number().int(),
  state: z.enum(["approved", "rejected"]),
  decidedBy: z.string().max(100).default("user"),
  note: z.string().max(500).default(""),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // auto-detect ứng viên dọn dẹp
  if (body.action === "detect") {
    return ok(autoDetect());
  }
  const parsed = DecideSchema.safeParse(body);
  if (!parsed.success) return err("Dữ liệu không hợp lệ.", 400);
  const { id, state, decidedBy, note } = parsed.data;
  const db = getDb();
  const row = db.prepare("SELECT id FROM approvals WHERE id=?").get(id);
  if (!row) return err("Không tìm thấy đề xuất.", 404);
  db.prepare("UPDATE approvals SET state=?, decided_by=?, decided_at=datetime('now'), note=? WHERE id=?")
    .run(state, decidedBy, note, id);
  audit(decidedBy, `approval_${state}`, { id });
  return ok({ id, state });
}
