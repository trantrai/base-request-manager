export const dynamic = "force-dynamic";

import { ok, err, checkSameOrigin } from "@/lib/api";
import {
  listApprovals, autoDetect, decideApproval,
  ApprovalNotFoundError, ApprovalNotProposedError,
} from "@/lib/approvals";
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
  if (!checkSameOrigin(req)) return err("Yêu cầu không hợp lệ.", 403);
  const body = await req.json().catch(() => ({}));
  // auto-detect ứng viên dọn dẹp
  if (body.action === "detect") {
    return ok(autoDetect());
  }
  const parsed = DecideSchema.safeParse(body);
  if (!parsed.success) return err("Dữ liệu không hợp lệ.", 400);
  const { id, state, decidedBy, note } = parsed.data;
  try {
    decideApproval(id, state, decidedBy, note);
  } catch (e) {
    if (e instanceof ApprovalNotFoundError) return err(e.message, 404);
    if (e instanceof ApprovalNotProposedError) return err(e.message, 409);
    throw e;
  }
  return ok({ id, state });
}
