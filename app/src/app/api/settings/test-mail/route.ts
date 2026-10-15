export const dynamic = "force-dynamic";

import { ok, err, checkSameOrigin, serverError } from "@/lib/api";
import { getSettings } from "@/lib/queries";
import { sendAlert } from "@/lib/mail";

/** Gửi email kiểm tra cấu hình SMTP. */
export async function POST(req: Request) {
  if (!checkSameOrigin(req)) return err("Yêu cầu không hợp lệ.", 403);
  const s = getSettings();
  const to = (s["alertTo"] as string) || "";
  if (!to) return err("Chưa nhập địa chỉ email nhận cảnh báo.", 400);
  try {
    await sendAlert({
      to,
      subject: "[BaseScope] Email kiểm tra cấu hình SMTP",
      html: "<p>Cấu hình SMTP của BaseScope hoạt động bình thường.</p><p>— Trạm quan trắc Base Request SAP B1</p>",
    });
    return ok({ sent: true, to });
  } catch (e) {
    return serverError(e, "Gửi email kiểm tra thất bại. Kiểm tra lại cấu hình SMTP.");
  }
}
