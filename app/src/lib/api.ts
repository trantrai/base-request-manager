import { NextResponse } from "next/server";

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data, error: null, meta: meta ?? null });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, data: null, error: message, meta: null }, { status });
}

/**
 * N1: kiểm tra Origin/Referer cho POST/PUT — defense-in-depth chống CSRF.
 * Các route đã chỉ parse JSON nên form CSRF thường bị chặn; đây là lớp bổ sung.
 * Chỉ chặn khi header Origin/Referer CÓ MẶT nhưng khác origin. Request không
 * header (curl, Task Scheduler) vẫn được phép.
 */
export function checkSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin") || req.headers.get("referer");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

/**
 * N4: log chi tiết lỗi server-side, trả message chung cho client
 * (tránh lộ body lỗi nội bộ từ Google / stack trace).
 */
export function serverError(e: unknown, publicMessage: string, status = 500) {
  console.error("[api]", publicMessage, e instanceof Error ? (e.stack ?? e.message) : e);
  return err(publicMessage, status);
}
// N10: đã xoá `export const dynamic` ở file lib (không có tác dụng, chỉ dùng ở route).
